"use client";
// beui.dev/components/agents/prompt-input

import { ArrowUp, Plus, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/motion/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/motion/select";
import { SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

export interface PromptModel {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptAction {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptInputProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSubmit" | "children"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  models?: PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  /** Persistent controls for the prompt — executor, profile, workspace, branch,
   *  model. Rendered on their own row below the textarea, above the action row. */
  meta?: ReactNode;
  className?: string;
}

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  actions = [],
  onAction,
  onSubmit,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  leadingAction,
  meta,
  className,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(
    defaultModel ?? models[0]?.value,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find(
    (option) => option.value === currentModelValue,
  );
  const canSubmit = Boolean(currentValue.trim()) && !disabled && !loading;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const measurement = measurementRef.current;
    if (!textarea || !measurement || textarea.value !== currentValue) return;

    const lineHeight = 24;
    const nextHeight = Math.min(
      Math.max(measurement.scrollHeight, minRows * lineHeight),
      maxRows * lineHeight,
    );
    const height = `${nextHeight}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
  }, [currentValue, maxRows, minRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const setModel = (next: string) => {
    if (model === undefined) setInternalModel(next);
    onModelChange?.(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = currentValue.trim();
    if (!prompt || disabled || loading) return;

    onSubmit?.(prompt, currentModelValue);
    if (value === undefined) setInternalValue("");
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "relative w-full rounded-panel border border-border/80 bg-background p-2 transition-colors focus-within:border-foreground/25",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={measurementRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-2 top-0 whitespace-pre-wrap px-2 text-sm leading-6 [overflow-wrap:break-word]"
      >
{`${currentValue}\u200b`}
      </div>
      {/* No horizontal padding on the textarea: the form is already `p-2`, so its
          own `px-2` doubled up and put the text 16px from the border while the
          toolbar's Plus button sat 8px in — the placeholder and the Plus glyph
          landed on different left edges. `pt-1.5` is kept for the optical offset
          under the border. */}
      <textarea
        ref={textareaRef}
        value={currentValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={minRows}
        {...textareaProps}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="scrollbar-hide block w-full resize-none overflow-y-auto bg-transparent pt-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/55"
      />

      {/* The metadata row, on its own line under the textarea.
          It used to share the action row with the send button, and that is what
          broke: measured at 900px and 768px, five chips competing with the
          primary action in one 32px row squeezed the send button down to 16x32 —
          a primary action rendered narrower than its own icon.

          `flex-wrap` is the collision guarantee, not a nicety. A single
          non-wrapping row can only resolve "too many controls" by shrinking or
          clipping, and shrinking is what produced the 16x32 button. Wrapping
          moves the overflow to a second line instead, so nothing is ever
          compressed to nothing. Each chip additionally caps its own width and
          truncates, so a long model id or branch name ellipsises rather than
          widening the row — which is what keeps the wrap rare in practice. */}
      {meta ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
          {meta}
        </div>
      ) : null}

      <div className="mt-1 flex min-h-8 items-center gap-1">
        {actions.length ? (
          <Popover open={actionsOpen} onOpenChange={setActionsOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || loading}
                aria-label="Add to prompt"
                className="size-8 shrink-0 rounded-full text-ink-3 transition-[transform,background-color] duration-150 hover:bg-surface/80 hover:text-ink active:scale-95 dark:hover:bg-well/60"
              >
                <Plus
                  className={cn(
                    "size-4 transition-transform duration-200 ease-[var(--ease-out-expo)]",
                    actionsOpen && "rotate-45 text-accent"
                  )}
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-64 p-1.5 shadow-float"
            >
              <div className="flex flex-col gap-0.5">
                {actions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      onAction?.(action.value);
                      setActionsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-control p-2 text-left outline-none",
                      "transition-[background-color,transform] duration-150 ease-[var(--ease-out-expo)]",
                      "hover:bg-accent/10 focus-visible:bg-accent/10 active:scale-[0.98]",
                      "disabled:pointer-events-none disabled:opacity-40"
                    )}
                  >
                    {action.icon ? (
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent [&_svg]:size-3.5">
                        {action.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-ink">
                        {action.label}
                      </span>
                      {action.description ? (
                        <span className="mt-0.5 block text-[11px] leading-tight text-ink-3">
                          {action.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        {leadingAction}
        {models.length ? (
          <Select
            value={currentModelValue}
            onValueChange={setModel}
            disabled={disabled || loading}
            className="min-w-0 shrink"
          >
            <SelectTrigger className="glass-flat h-8 w-auto max-w-52 rounded-xl px-2 text-xs hover:bg-muted focus-visible:ring-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {currentModel?.icon ? (
                  <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5">
                    {currentModel.icon}
                  </span>
                ) : null}
                <span className="truncate text-muted-foreground">
                  {currentModel?.label ?? "Choose model"}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent className="w-52">
              {models.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.icon ? (
                      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {option.label}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button
          type={loading ? "button" : "submit"}
          size="icon"
          disabled={loading ? !onStop : !canSubmit}
          aria-label={loading ? "Stop generating" : "Send prompt"}
          onClick={loading ? onStop : undefined}
          className={cn(
            "ml-auto size-8 shrink-0 rounded-full shadow-sm transition-[transform,opacity,background-color] duration-150 active:scale-95",
            loading
              ? "bg-danger text-accent-ink hover:opacity-90"
              : canSubmit
                ? "bg-accent text-accent-ink hover:opacity-90"
                : "bg-well text-ink-4 opacity-40 cursor-not-allowed scale-100"
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={loading ? "stop" : "send"}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="grid place-items-center"
            >
              {loading ? (
                <Square className="size-3 shrink-0 fill-current" />
              ) : (
                <ArrowUp className="size-4 shrink-0 stroke-[2.5]" />
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}
