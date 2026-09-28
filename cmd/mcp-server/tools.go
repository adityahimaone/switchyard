package main

import (
	"context"
	"sort"

	"kanban-board/internal/kanban"
)

var version = "v0.2.0"

func sortToolSpecs(specs []toolSpec) {
	sort.Slice(specs, func(i, j int) bool { return specs[i].Name < specs[j].Name })
}

func argString(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func argInt(args map[string]any, key string) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return 0
}

// readOnlyTools returns the complete tool surface. Every handler here is
// side-effect free; nothing in this map mutates board or workspace state.
func readOnlyTools() map[string]toolHandler {
	return map[string]toolHandler{
		"list_boards":  func(ctx context.Context, a map[string]any) (any, error) { return kanban.ListBoards() },
		"list_tasks":   listTasks,
		"search_tasks": listTasks,
		"get_task":     getTask,
		"list_task_comments": func(ctx context.Context, a map[string]any) (any, error) {
			return kanban.ListComments(argString(a, "board"), argString(a, "task_id"))
		},
		"list_task_events": func(ctx context.Context, a map[string]any) (any, error) {
			return kanban.TaskEvents(argString(a, "board"), argString(a, "task_id"))
		},
		"task_health": func(ctx context.Context, a map[string]any) (any, error) {
			return kanban.TaskHealthFor(argString(a, "board"), argString(a, "task_id"))
		},
		"tail_worker_log":  workerLog,
		"list_workspaces":  func(ctx context.Context, a map[string]any) (any, error) { return kanban.ListWorkspaces() },
		"read_log_tail":    logTail,
		"list_mcp_servers": listMCPServers,
		"codegraph_report": codegraphReport,
	}
}

// listMCPServers defaults to the default profile; the agent config is
// profile-scoped, and an omitted argument must not become an empty profile.
func listMCPServers(ctx context.Context, a map[string]any) (any, error) {
	profile := argString(a, "profile")
	if profile == "" {
		profile = "default"
	}
	return kanban.ListHermesMCPServers(profile)
}

func listTasks(ctx context.Context, a map[string]any) (any, error) {
	slug := argString(a, "board")
	if slug == "" {
		return nil, errBoardRequired
	}
	limit := argInt(a, "limit")
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	query := kanban.TaskQuery{
		Status:     argString(a, "status"),
		Assignee:   argString(a, "assignee"),
		Q:          argString(a, "q"),
		Unassigned: argString(a, "unassigned") == "true",
		Limit:      limit,
		Offset:     argInt(a, "offset"),
	}
	tasks, total, err := kanban.ListTasksQuery(slug, query)
	if err != nil {
		return nil, err
	}
	return map[string]any{"tasks": tasks, "total": total, "returned": len(tasks)}, nil
}

func getTask(ctx context.Context, a map[string]any) (any, error) {
	slug, taskID := argString(a, "board"), argString(a, "task_id")
	if slug == "" {
		return nil, errBoardRequired
	}
	return kanban.GetTask(slug, taskID)
}

func workerLog(ctx context.Context, a map[string]any) (any, error) {
	return kanban.WorkerLogTail(argString(a, "board"), argString(a, "task_id"), int64(argInt(a, "offset")))
}

func logTail(ctx context.Context, a map[string]any) (any, error) {
	key := argString(a, "file")
	if key == "" {
		key = "agent"
	}
	return kanban.ReadLogTail(key, argString(a, "tail"))
}

func codegraphReport(ctx context.Context, a map[string]any) (any, error) {
	id := argString(a, "workspace_id")
	if id == "" {
		return nil, errWorkspaceRequired
	}
	workspaces, err := kanban.ListWorkspaces()
	if err != nil {
		return nil, err
	}
	for i := range workspaces {
		if workspaces[i].ID == id {
			return kanban.CodeGraphReportForWorkspace(&workspaces[i])
		}
	}
	return nil, errWorkspaceNotFound
}

type simpleError string

func (e simpleError) Error() string { return string(e) }

const (
	errBoardRequired     = simpleError("board is required")
	errWorkspaceRequired = simpleError("workspace_id is required")
	errWorkspaceNotFound = simpleError("workspace not found")
)

// handlerSchema and handlerDesc document the read-only surface. Schemas are
// declared alongside the handlers so tools/list stays accurate.
func handlerSchema(name string) map[string]any {
	boardTask := obj(map[string]any{
		"board":   str("Board slug, e.g. \"default\""),
		"task_id": str("Task id, e.g. \"t_abc123\""),
	}, "board", "task_id")
	switch name {
	case "list_tasks", "search_tasks":
		return obj(map[string]any{
			"board":      str("Board slug"),
			"status":     str("Filter by status: triage, todo, scheduled, ready, running, blocked, review, done, archived"),
			"assignee":   str("Filter by assignee profile name"),
			"unassigned": str("Set to \"true\" to list only unassigned tasks"),
			"q":          str("Free-text search over title, body, id, and result"),
			"limit":      integer("Max rows (default 50, cap 500)"),
			"offset":     integer("Row offset for pagination"),
		}, "board")
	case "get_task":
		return boardTask
	case "list_task_comments", "list_task_events":
		return boardTask
	case "task_health":
		return boardTask
	case "tail_worker_log":
		return obj(map[string]any{
			"board":   str("Board slug"),
			"task_id": str("Task id"),
			"offset":  integer("Byte offset to resume from"),
		}, "board", "task_id")
	case "read_log_tail":
		return obj(map[string]any{
			"file": str("Log key: agent, errors, gateway, gui, mcp, update"),
			"tail": str("Tail size: 100, 200, 500, 1000"),
		})
	case "list_mcp_servers":
		return obj(map[string]any{"profile": str("Agent profile (default: default)")})
	case "codegraph_report":
		return obj(map[string]any{"workspace_id": str("Workspace id")}, "workspace_id")
	default:
		return obj(map[string]any{})
	}
}

func handlerDesc(name string) string {
	switch name {
	case "list_boards":
		return "List all kanban boards with their slug, name, and status."
	case "list_tasks":
		return "List tasks on a board with optional status/assignee filters and pagination."
	case "search_tasks":
		return "Search tasks by free text across title, body, id, and result."
	case "get_task":
		return "Fetch a single task by id, including body and result."
	case "list_task_comments":
		return "List the comments on a task, oldest first."
	case "list_task_events":
		return "List a task's execution events and run history, newest first."
	case "task_health":
		return "Report liveness health for a task: healthy, stuck, silent, lost, or unknown."
	case "tail_worker_log":
		return "Tail the raw worker log for a task from a byte offset."
	case "list_workspaces":
		return "List registered workspaces with paths, hosts, and ping status."
	case "read_log_tail":
		return "Tail a whitelisted agent log file."
	case "list_mcp_servers":
		return "List the MCP servers configured in the hermes agent's own config."
	case "codegraph_report":
		return "Report codegraph index status for each app in a workspace."
	}
	return ""
}
