// Command mcp-server exposes read-only Switchyard board operations over the
// Model Context Protocol on stdio, so any MCP client (Claude Code, editors,
// hermes) can query the board.
//
// It is deliberately READ-ONLY. There is no flag that enables mutation:
// workspace save/delete would feed unvalidated Host/Path values into `sh -lc`
// and `ssh`, and board approval commits and pushes. Those are not reachable
// from here by design.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const protocolVersion = "2024-11-05"

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type responseError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *responseError  `json:"error,omitempty"`
}

type toolSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

func obj(props map[string]any, required ...string) map[string]any {
	schema := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
func integer(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func serverInfo() map[string]any {
	return map[string]any{
		"protocolVersion": protocolVersion,
		"capabilities":    map[string]any{"tools": map[string]any{}},
		"serverInfo":      map[string]any{"name": "switchyard", "version": version},
	}
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(version)
		return
	}
	srv := &server{tools: readOnlyTools()}
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	for in.Scan() {
		line := strings.TrimSpace(in.Text())
		if line == "" {
			continue
		}
		var req request
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			continue
		}
		resp, ok := srv.handle(context.Background(), &req)
		if !ok {
			continue
		}
		body, err := json.Marshal(resp)
		if err != nil {
			continue
		}
		out.Write(body)
		out.WriteByte('\n')
		out.Flush()
	}
}

type server struct {
	tools map[string]toolHandler
}

type toolHandler func(ctx context.Context, args map[string]any) (any, error)

func (s *server) handle(ctx context.Context, req *request) (response, bool) {
	// Notifications carry no id and expect no reply.
	if len(req.ID) == 0 {
		return response{}, false
	}
	switch req.Method {
	case "initialize":
		return response{JSONRPC: "2.0", ID: req.ID, Result: serverInfo()}, true
	case "ping":
		return response{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}}, true
	case "tools/list":
		return response{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{"tools": s.toolSpecs()}}, true
	case "tools/call":
		return response{JSONRPC: "2.0", ID: req.ID, Result: s.call(ctx, req.Params)}, true
	default:
		return response{JSONRPC: "2.0", ID: req.ID, Error: &responseError{Code: -32601, Message: "method not found: " + req.Method}}, true
	}
}

func (s *server) toolSpecs() []toolSpec {
	specs := make([]toolSpec, 0, len(s.tools))
	for name := range s.tools {
		specs = append(specs, toolSpec{Name: name, Description: handlerDesc(name), InputSchema: handlerSchema(name)})
	}
	sortToolSpecs(specs)
	return specs
}

// call runs a tool and wraps the result in the MCP text-content envelope.
// A handler error is reported as a successful call with isError set, which is
// how MCP clients surface tool failures to the model.
func (s *server) call(ctx context.Context, params json.RawMessage) map[string]any {
	var payload struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(params, &payload); err != nil {
		return toolError("invalid tool call params: " + err.Error())
	}
	handler, ok := s.tools[payload.Name]
	if !ok {
		return toolError("unknown tool: " + payload.Name)
	}
	result, err := handler(ctx, payload.Arguments)
	if err != nil {
		return toolError(err.Error())
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return toolError(err.Error())
	}
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(encoded)}},
	}
}

func toolError(message string) map[string]any {
	return map[string]any{
		"isError": true,
		"content": []map[string]any{{"type": "text", "text": message}},
	}
}
