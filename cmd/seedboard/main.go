package main

// One-off: seed a board's schema the way the import flow does,
// so a board created over the API can hold cards.

import (
	"fmt"
	"os"

	"kanban-board/internal/kanban"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: seedboard <slug>")
		os.Exit(2)
	}
	if err := kanban.EnsureImportSchemaPublic(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("seeded board", os.Args[1])
}
