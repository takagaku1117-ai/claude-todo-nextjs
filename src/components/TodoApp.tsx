"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  saveTodos,
  subscribe,
  type Todo,
} from "@/lib/todoStore";

type Filter = "all" | "active" | "done";

type Removed = {
  items: { todo: Todo; index: number }[];
  message: string;
};

const MAX_LENGTH = 100;
const UNDO_MS = 6000;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: "未完了" },
  { value: "done", label: "完了" },
];

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function TodoApp() {
  const todos = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 「元に戻す」は数秒で自動的に消す
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const loading = todos === null;
  const list = todos ?? [];
  const trimmed = title.trim();
  const activeCount = list.filter((t) => !t.done).length;
  const doneCount = list.length - activeCount;
  const counts: Record<Filter, number> = {
    all: list.length,
    active: activeCount,
    done: doneCount,
  };
  const visible = list.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.done : t.done,
  );

  function commit(next: Todo[]) {
    setSaveFailed(!saveTodos(next));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    commit([
      { id: newId(), title: trimmed, done: false, createdAt: Date.now() },
      ...list,
    ]);
    setTitle("");
    // 「完了」タブで追加すると見えなくなるので、未完了が見えるタブに戻す
    if (filter === "done") setFilter("all");
    inputRef.current?.focus();
  }

  function handleToggle(id: string) {
    commit(list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function removeWhere(match: (t: Todo) => boolean, message: string) {
    const items = list
      .map((todo, index) => ({ todo, index }))
      .filter(({ todo }) => match(todo));
    if (items.length === 0) return;
    commit(list.filter((t) => !match(t)));
    setRemoved({ items, message });
  }

  function handleDelete(todo: Todo) {
    removeWhere((t) => t.id === todo.id, `「${todo.title}」を削除しました`);
  }

  function handleClearDone() {
    removeWhere((t) => t.done, `完了済みの${doneCount}件を削除しました`);
  }

  function handleUndo() {
    if (!removed) return;
    const next = [...list];
    // 元の位置に近い場所へ戻す（index の小さい順に差し込む）
    for (const { todo, index } of removed.items) {
      next.splice(Math.min(index, next.length), 0, todo);
    }
    commit(next);
    setRemoved(null);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-10 sm:pt-16">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink">やることリスト</h1>
        <p className="mt-2 text-base text-ink-soft">
          {loading
            ? "読み込み中…"
            : list.length === 0
              ? "まだタスクはありません"
              : `残り ${activeCount} 件 ／ 全 ${list.length} 件`}
        </p>
      </header>

      <form onSubmit={handleAdd} className="mb-6">
        <label htmlFor="new-todo" className="mb-2 block text-sm font-semibold text-ink">
          新しいタスク
        </label>
        <div className="flex gap-2">
          <input
            id="new-todo"
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_LENGTH}
            placeholder="例：牛乳を買う"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby="new-todo-hint"
            className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-4 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!trimmed}
            className="min-h-12 shrink-0 rounded-xl bg-accent px-5 text-lg font-bold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
          >
            追加
          </button>
        </div>
        <p id="new-todo-hint" className="mt-2 flex justify-between text-sm text-ink-soft">
          <span>Enterキーでも追加できます</span>
          <span className={title.length >= MAX_LENGTH - 10 ? "font-semibold text-danger" : ""}>
            {title.length}/{MAX_LENGTH}
          </span>
        </p>
      </form>

      {saveFailed && (
        <p role="alert" className="mb-4 rounded-xl border-2 border-danger bg-danger-soft px-4 py-3 text-base text-danger">
          ブラウザに保存できませんでした。プライベートブラウズを解除するか、空き容量を確認してください。
        </p>
      )}

      <div role="group" aria-label="表示するタスク" className="mb-4 flex gap-2">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-11 flex-1 rounded-full border-2 px-3 text-base font-semibold transition-colors ${
              filter === value
                ? "border-ink bg-ink text-surface"
                : "border-line bg-surface text-ink-soft hover:border-ink-faint"
            }`}
          >
            {label}
            <span className="ml-1 tabular-nums">{counts[value]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-line/60" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} hasAny={list.length > 0} onFocusInput={() => inputRef.current?.focus()} />
      ) : (
        <ul className="space-y-2">
          {visible.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-1 rounded-xl border-2 border-line bg-surface pr-1"
            >
              <label className="flex min-h-16 flex-1 cursor-pointer items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => handleToggle(todo.id)}
                  className="size-6 shrink-0 cursor-pointer accent-accent"
                />
                <span
                  className={`break-all text-lg ${
                    todo.done ? "text-ink-faint line-through" : "text-ink"
                  }`}
                >
                  {todo.title}
                </span>
              </label>
              <button
                type="button"
                onClick={() => handleDelete(todo)}
                aria-label={`「${todo.title}」を削除`}
                className="flex min-h-12 shrink-0 items-center gap-1 rounded-lg px-3 text-base font-semibold text-danger hover:bg-danger-soft"
              >
                <TrashIcon />
                <span className="hidden sm:inline">削除</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {doneCount > 0 && (
        <div className="mt-6 text-right">
          <button
            type="button"
            onClick={handleClearDone}
            className="min-h-11 rounded-lg px-3 text-base font-semibold text-ink-soft underline underline-offset-4 hover:text-danger"
          >
            完了済みをまとめて削除（{doneCount}件）
          </button>
        </div>
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-4 pb-6"
      >
        {removed && (
          <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-surface shadow-lg">
            <span className="min-w-0 truncate text-base">{removed.message}</span>
            <button
              type="button"
              onClick={handleUndo}
              className="min-h-11 shrink-0 rounded-lg bg-surface px-4 text-base font-bold text-ink hover:bg-line"
            >
              元に戻す
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({
  filter,
  hasAny,
  onFocusInput,
}: {
  filter: Filter;
  hasAny: boolean;
  onFocusInput: () => void;
}) {
  const text =
    !hasAny
      ? "最初のタスクを追加してみましょう"
      : filter === "active"
        ? "未完了のタスクはありません。おつかれさまでした！"
        : "完了したタスクはまだありません";

  return (
    <div className="rounded-xl border-2 border-dashed border-line px-6 py-10 text-center">
      <p className="text-lg text-ink-soft">{text}</p>
      {!hasAny && (
        <button
          type="button"
          onClick={onFocusInput}
          className="mt-4 min-h-11 rounded-lg px-4 text-base font-semibold text-accent underline underline-offset-4"
        >
          入力欄へ移動
        </button>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
