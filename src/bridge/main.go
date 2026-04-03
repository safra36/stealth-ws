package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gorilla/websocket"
	tls "github.com/refraction-networking/utls"
)

// Message types sent to Node.js
type Msg struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Binary  bool   `json:"binary,omitempty"`
	Code    int    `json:"code,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

// Config received from Node.js
type Config struct {
	Type        string            `json:"type"`
	URL         string            `json:"url"`
	Fingerprint string            `json:"fingerprint"`
	Cookies     string            `json:"cookies"`
	Proxy       string            `json:"proxy,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

// fingerprintMap maps JS profile names to uTLS ClientHelloIDs
// Maps to available constants in refraction-networking/utls v1.6.6
var fingerprintMap = map[string]tls.ClientHelloID{
	"chrome120":   tls.HelloChrome_120,
	"chrome119":   tls.HelloChrome_120,    // not in v1.6.6, use closest
	"chrome118":   tls.HelloChrome_115_PQ, // closest available
	"chrome117":   tls.HelloChrome_115_PQ,
	"chrome116":   tls.HelloChrome_115_PQ,
	"chrome115":   tls.HelloChrome_115_PQ,
	"chrome114":   tls.HelloChrome_114_Padding_PSK_Shuf,
	"chrome113":   tls.HelloChrome_112_PSK_Shuf,
	"chrome112":   tls.HelloChrome_112_PSK_Shuf,
	"chrome110":   tls.HelloChrome_106_Shuffle,
	"chrome100":   tls.HelloChrome_100,
	"chromeAuto":  tls.HelloChrome_Auto,
	"firefox121":  tls.HelloFirefox_120,   // not in v1.6.6, use closest
	"firefox120":  tls.HelloFirefox_120,
	"firefox115":  tls.HelloFirefox_105,   // closest available
	"firefox110":  tls.HelloFirefox_105,
	"firefox100":  tls.HelloFirefox_99,
	"firefoxAuto": tls.HelloFirefox_Auto,
	"safari17":    tls.HelloSafari_16_0,   // closest available
	"safari16":    tls.HelloSafari_16_0,
	"safari15":    tls.HelloSafari_16_0,
	"safari14":    tls.HelloSafari_16_0,
	"safariAuto":  tls.HelloSafari_Auto,
	"edge120":     tls.HelloEdge_106,      // closest available
	"edge119":     tls.HelloEdge_106,
	"edge118":     tls.HelloEdge_106,
	"edge117":     tls.HelloEdge_106,
	"edge116":     tls.HelloEdge_106,
	"edgeAuto":    tls.HelloEdge_Auto,
	"ios17":       tls.HelloIOS_14,        // closest available
	"ios16":       tls.HelloIOS_14,
	"ios15":       tls.HelloIOS_14,
	"iosAuto":     tls.HelloIOS_Auto,
	"android12":   tls.HelloAndroid_11_OkHttp,
	"android11":   tls.HelloAndroid_11_OkHttp,
	"androidAuto": tls.HelloAndroid_11_OkHttp,
}

var stdout = bufio.NewWriter(os.Stdout)

func emit(msg Msg) {
	b, _ := json.Marshal(msg)
	fmt.Fprintln(stdout, string(b))
	stdout.Flush()
}

func emitError(message string) {
	emit(Msg{Type: "error", Message: message})
}

func main() {
	// Read config from stdin
	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return
	}

	var config Config
	if err := json.Unmarshal(scanner.Bytes(), &config); err != nil {
		emitError("Failed to parse config: " + err.Error())
		return
	}

	// Validate config
	if config.URL == "" {
		emitError("URL is required")
		return
	}

	// Build dialer with TLS fingerprint spoofing
	dialer := &websocket.Dialer{
		NetDialTLSContext: createTLSConnector(config),
	}

	// Add proxy support if specified
	if config.Proxy != "" {
		proxyURL, _ := parseProxy(config.Proxy)
		if proxyURL != nil {
			dialer.Proxy = http.ProxyURL(proxyURL)
		}
	}

	// Build headers
	headers := buildHeaders(config)

	// Connect to WebSocket server
	conn, resp, err := dialer.Dial(config.URL, headers)
	if err != nil {
		if resp != nil && resp.StatusCode == 403 {
			emit(Msg{Type: "auth_required"})
		} else {
			emit(Msg{Type: "error", Message: err.Error()})
		}
		return
	}
	defer conn.Close()

	emit(Msg{Type: "open"})

	// stdin -> WS
	go handleStdin(conn)

	// WS -> stdout
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			emit(Msg{Type: "close", Code: 1006})
			return
		}

		switch msgType {
		case websocket.TextMessage:
			emit(Msg{Type: "message", Data: string(data)})

		case websocket.BinaryMessage:
			emit(Msg{Type: "binary", Data: string(data)})
		}
	}
}

// createTLSConnector creates a TLS connector with spoofed fingerprint
func createTLSConnector(config Config) func(ctx context.Context, network, addr string) (net.Conn, error) {
	helloID, ok := fingerprintMap[config.Fingerprint]
	if !ok {
		helloID = tls.HelloChrome_Auto
	}

	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		rawConn, err := net.Dial(network, addr)
		if err != nil {
			return nil, err
		}

		spec, err := tls.UTLSIdToSpec(helloID)
		if err != nil {
			rawConn.Close()
			return nil, err
		}

		// Force HTTP/1.1 ALPN (Chrome uses HTTP/1.1 for WebSocket)
		for i, ext := range spec.Extensions {
			if alpn, ok := ext.(*tls.ALPNExtension); ok {
				alpn.AlpnProtocols = []string{"http/1.1"}
				spec.Extensions[i] = alpn
				break
			}
		}

		// Extract server name from address
		serverName := addr
		if strings.Contains(addr, ":") {
			serverName = strings.Split(addr, ":")[0]
		}

		// Create uTLS connection with spoofed fingerprint
		tlsConn := tls.UClient(rawConn, &tls.Config{ServerName: serverName}, tls.HelloCustom)
		if err := tlsConn.ApplyPreset(&spec); err != nil {
			rawConn.Close()
			return nil, err
		}

		if err := tlsConn.Handshake(); err != nil {
			rawConn.Close()
			return nil, err
		}

		return tlsConn, nil
	}
}

// buildHeaders constructs HTTP headers for WebSocket upgrade
func buildHeaders(config Config) http.Header {
	headers := http.Header{
		"Accept":          {"*/*"},
		"Accept-Language": {"en-US,en;q=0.9"},
	}

	// Set defaults if not provided by caller
	if _, ok := config.Headers["User-Agent"]; !ok {
		headers.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	}

	if config.Cookies != "" {
		headers.Set("Cookie", config.Cookies)
	}

	// Apply caller-provided headers (override defaults)
	for key, value := range config.Headers {
		headers.Set(key, value)
	}

	return headers
}

// parseProxy parses proxy URL
func parseProxy(proxyStr string) (*url.URL, error) {
	return url.Parse(proxyStr)
}

// handleStdin reads from stdin and sends to WebSocket
func handleStdin(conn *websocket.Conn) {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var m Msg
		if json.Unmarshal(scanner.Bytes(), &m) != nil {
			continue
		}

		switch m.Type {
		case "send":
			msgType := websocket.TextMessage
			if m.Binary {
				msgType = websocket.BinaryMessage
			}
			conn.WriteMessage(msgType, []byte(m.Data))
		case "close":
			conn.Close()
			return
		}
	}
}
