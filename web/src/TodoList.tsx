"use client"

import styles from "./TodoList.module.css"
import { useState } from "react"

export type TaskListStatus = "pending" | "active" | "done" | "error"
export type TaskListTask = { id: string; label: string; detail?: string; status: TaskListStatus; tone?: "session" | "tool" | "model" }

const cls = (base: string, on?: boolean) => `${base}${on ? ` ${styles.on}` : ""}`
const CheckIcon = ({ on }: { on?: boolean }) => <svg className={cls(styles.todoIcon, on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
const ArrowIcon = ({ on }: { on?: boolean }) => <svg className={cls(`${styles.todoIcon} ${styles.strong}`, on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
const DashedIcon = ({ on }: { on?: boolean }) => <svg className={cls(styles.todoIcon, on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" /></svg>
const FilledCheckIcon = () => <svg className={styles.todoHeadCheck} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" fill="currentColor" /></svg>

export function TaskList({ tasks, title = "Context activity", defaultOpen = true, complete = false }: { tasks: TaskListTask[]; title?: string; defaultOpen?: boolean; complete?: boolean }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const doneCount = complete ? tasks.length : tasks.filter((task) => task.status === "done").length
  return <div className={styles.todo}>
    <button type="button" className={styles.todoHead} aria-expanded={!collapsed} aria-label={`Toggle ${title}`} onClick={() => setCollapsed((value) => !value)}>
      <span className={styles.todoHeadIcon}>{complete ? <FilledCheckIcon /> : <svg className={styles.todoListIcon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5h8" /><path d="M13 12h8" /><path d="M13 19h8" /><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /></svg>}<svg className={styles.todoChevron} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m19.5 8.25-7.5 7.5-7.5-7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <span className={styles.todoTitle}>{title}</span><span className={styles.todoCount}>{doneCount}/{tasks.length}</span>
    </button>
    <div className={`${styles.todoCollapsible}${collapsed ? ` ${styles.isCollapsed}` : ""}`}><div className={styles.todoInner}><ul className={styles.todoList}>{tasks.length ? tasks.map((task, index) => {
      const done = complete || task.status === "done"
      const active = !complete && task.status === "active"
      return <li key={task.id} className={`${styles.todoItem}${done ? ` ${styles.done}` : active ? ` ${styles.active}` : ""}${task.tone ? ` ${styles[task.tone]}` : ""}`} style={{ ["--i" as string]: index }}><span className={styles.todoIconWrap}>{done ? <CheckIcon on /> : active ? <ArrowIcon on /> : <DashedIcon on />}</span><span className={styles.todoLabel} data-label={task.label}>{task.label}</span>{task.detail && <span className={styles.todoDetail}>{task.detail}</span>}</li>
    }) : <li className={styles.todoEmpty}>No context steps yet</li>}</ul></div></div>
  </div>
}
