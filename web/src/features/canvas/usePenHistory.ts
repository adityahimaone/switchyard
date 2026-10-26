import { useState, useCallback, useRef } from "react"
import type { PenDocument, PenNode } from "./penTypes"
import { findNodeById, updateNodeInTree, deleteNodeFromTree, duplicateNodeInTree, moveNodeLayer } from "./penTypes"

const MAX_HISTORY_STEPS = 50

export function usePenHistory(
  initialDoc: PenDocument,
  onAutoSave: (doc: PenDocument) => void
) {
  const [doc, setDoc] = useState<PenDocument>(initialDoc)
  const pastRef = useRef<PenDocument[]>([])
  const futureRef = useRef<PenDocument[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const updateHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  // Sync external document changes (e.g. file loaded from server)
  const resetDoc = useCallback((newDoc: PenDocument) => {
    setDoc(newDoc)
    pastRef.current = []
    futureRef.current = []
    updateHistoryFlags()
  }, [updateHistoryFlags])

  // Snapshot before a mutating action
  const pushSnapshot = useCallback((current: PenDocument) => {
    pastRef.current.push(JSON.parse(JSON.stringify(current)))
    if (pastRef.current.length > MAX_HISTORY_STEPS) {
      pastRef.current.shift()
    }
    futureRef.current = []
    updateHistoryFlags()
  }, [updateHistoryFlags])

  // Undo action (Cmd+Z)
  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    const previous = pastRef.current.pop()!
    futureRef.current.push(JSON.parse(JSON.stringify(doc)))
    setDoc(previous)
    updateHistoryFlags()
    onAutoSave(previous)
  }, [doc, onAutoSave, updateHistoryFlags])

  // Redo action (Cmd+Shift+Z / Cmd+Y)
  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current.pop()!
    pastRef.current.push(JSON.parse(JSON.stringify(doc)))
    setDoc(next)
    updateHistoryFlags()
    onAutoSave(next)
  }, [doc, onAutoSave, updateHistoryFlags])

  // Update a single node with history recording
  const updateNode = useCallback(
    (updated: PenNode, recordHistory = true) => {
      setDoc((prev) => {
        if (recordHistory) {
          pushSnapshot(prev)
        }
        const nextChildren = updateNodeInTree(prev.children, updated.id, updated)
        const nextDoc = { ...prev, children: nextChildren }
        onAutoSave(nextDoc)
        return nextDoc
      })
    },
    [onAutoSave, pushSnapshot]
  )

  // Delete a node
  const deleteNode = useCallback(
    (nodeId: string) => {
      setDoc((prev) => {
        pushSnapshot(prev)
        const nextChildren = deleteNodeFromTree(prev.children, nodeId)
        const nextDoc = { ...prev, children: nextChildren }
        onAutoSave(nextDoc)
        return nextDoc
      })
    },
    [onAutoSave, pushSnapshot]
  )

  // Duplicate a node
  const duplicateNode = useCallback(
    (nodeId: string): string | null => {
      let createdId: string | null = null
      setDoc((prev) => {
        pushSnapshot(prev)
        const { nodes: nextChildren, newId } = duplicateNodeInTree(prev.children, nodeId)
        createdId = newId
        const nextDoc = { ...prev, children: nextChildren }
        onAutoSave(nextDoc)
        return nextDoc
      })
      return createdId
    },
    [onAutoSave, pushSnapshot]
  )

  // Reorder node layer (bring forward, send backward, to front, to back)
  const reorderNode = useCallback(
    (nodeId: string, direction: "forward" | "backward" | "front" | "back") => {
      setDoc((prev) => {
        pushSnapshot(prev)
        const nextChildren = moveNodeLayer(prev.children, nodeId, direction)
        const nextDoc = { ...prev, children: nextChildren }
        onAutoSave(nextDoc)
        return nextDoc
      })
    },
    [onAutoSave, pushSnapshot]
  )

  // Add a new node
  const addNode = useCallback(
    (parentOrRoot: "root" | string, type: "frame" | "rectangle" | "text") => {
      let createdId: string | null = null
      setDoc((prev) => {
        pushSnapshot(prev)
        const newNodeId = `node_${Date.now()}`
        createdId = newNodeId
        let newNode: PenNode

        if (type === "text") {
          newNode = {
            type: "text",
            id: newNodeId,
            name: "Text Layer",
            content: "Text content",
            text: "Text content",
            fontSize: 14,
            fontWeight: "400",
            fill: "#ffffff",
          }
        } else if (type === "rectangle") {
          newNode = {
            type: "rectangle",
            id: newNodeId,
            name: "Rectangle",
            width: 120,
            height: 120,
            cornerRadius: 8,
            fill: "#262730",
          }
        } else {
          newNode = {
            type: "frame",
            id: newNodeId,
            name: "Frame",
            x: 80,
            y: 80,
            width: 390,
            height: 844,
            cornerRadius: 16,
            fill: "#18191f",
            stroke: "rgba(255,255,255,0.1)",
            strokeWidth: 1,
            layout: "vertical",
            padding: 16,
            gap: 12,
          }
        }

        let nextChildren: PenNode[]
        if (parentOrRoot === "root" || !parentOrRoot) {
          nextChildren = [...prev.children, newNode]
        } else {
          const target = findNodeById(prev.children, parentOrRoot)
          if (target && target.type === "frame") {
            const updatedTarget = {
              ...target,
              children: [...(target.children || []), newNode],
            }
            nextChildren = updateNodeInTree(prev.children, parentOrRoot, updatedTarget)
          } else {
            nextChildren = [...prev.children, newNode]
          }
        }

        const nextDoc = { ...prev, children: nextChildren }
        onAutoSave(nextDoc)
        return nextDoc
      })
      return createdId
    },
    [onAutoSave, pushSnapshot]
  )

  return {
    doc,
    setDoc,
    resetDoc,
    pushSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    updateNode,
    deleteNode,
    duplicateNode,
    reorderNode,
    addNode,
  }
}
