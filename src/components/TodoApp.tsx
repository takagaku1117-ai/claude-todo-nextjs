"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  parseTodos,
  saveTodos,
  subscribe,
  type Todo,
} from "@/lib/todoStore";

type Filter = "all" | "active" | "done";

// 操作のたびに画面下に出すお知らせ。削除のときだけ「元に戻す」用のデータを持つ
type Toast = {
  message: string;
  removed?: { todo: Todo; index: number }[];
};

const MAX_LENGTH = 100;
const TOAST_MS = 3000;
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // 編集中のタスクのidと、入力途中の文字。null のときは何も編集していない
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // お知らせは数秒で自動的に消す（「元に戻す」付きは押す時間を長めに）
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.removed ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

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
    setToast({ message: `「${trimmed}」を追加しました` });
    // 「完了」タブで追加すると見えなくなるので、未完了が見えるタブに戻す
    if (filter === "done") setFilter("all");
    inputRef.current?.focus();
  }

  function handleToggle(todo: Todo) {
    commit(list.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    setToast({
      message: todo.done
        ? `「${todo.title}」を未完了に戻しました`
        : `「${todo.title}」を完了にしました`,
    });
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setDraft(todo.title);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSaveEdit(e: React.FormEvent, todo: Todo) {
    e.preventDefault();
    const nextTitle = draft.trim();
    if (!nextTitle) return;
    setEditingId(null);
    // 何も変えずに保存したときは、保存もお知らせもしない
    if (nextTitle === todo.title) return;
    commit(list.map((t) => (t.id === todo.id ? { ...t, title: nextTitle } : t)));
    setToast({ message: `「${nextTitle}」に変更しました` });
  }

  function removeWhere(match: (t: Todo) => boolean, message: string) {
    const items = list
      .map((todo, index) => ({ todo, index }))
      .filter(({ todo }) => match(todo));
    if (items.length === 0) return;
    commit(list.filter((t) => !match(t)));
    setToast({ message, removed: items });
  }

  function handleDelete(todo: Todo) {
    removeWhere((t) => t.id === todo.id, `「${todo.title}」を削除しました`);
  }

  function handleClearDone() {
    removeWhere((t) => t.done, `完了済みの${doneCount}件を削除しました`);
  }

  // 別のブラウザやスマホへ引っ越せるように、今のタスクをファイルにする
  function handleExport() {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `やることリスト_${new Date().toLocaleDateString("sv-SE")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: `${list.length}件をファイルに書き出しました` });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じファイルをもう一度選んでも反応するように空にしておく
    e.target.value = "";
    if (!file) return;
    const imported = parseTodos(await file.text());
    if (!imported) {
      setToast({ message: "✕ このアプリで書き出したファイルではないようです" });
      return;
    }
    // 今のタスクは消さずに足す。同じタスク（同じid）は重ねない
    const ids = new Set(list.map((t) => t.id));
    const added = imported.filter((t) => !ids.has(t.id));
    commit([...list, ...added].sort((a, b) => b.createdAt - a.createdAt));
    const skipped = imported.length - added.length;
    setToast({
      message: `${added.length}件を読み込みました${skipped ? `（同じタスク${skipped}件はそのまま）` : ""}`,
    });
  }

  function handleUndo() {
    if (!toast?.removed) return;
    const next = [...list];
    // 元の位置に近い場所へ戻す（index の小さい順に差し込む）
    for (const { todo, index } of toast.removed) {
      next.splice(Math.min(index, next.length), 0, todo);
    }
    commit(next);
    setToast({ message: "元に戻しました" });
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
        <label htmlFor="new-todo" className="mb-2 block text-base font-semibold text-ink">
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
        <p id="new-todo-hint" className="mt-2 flex justify-between gap-3 text-base text-ink-soft">
          <span>{trimmed ? "Enterキーでも追加できます" : "文字を入れると追加できます"}</span>
          {/* 上限が近いときは色だけでなく「あと○文字」の言葉でも知らせる */}
          <span className={`shrink-0 ${title.length >= MAX_LENGTH - 10 ? "font-semibold text-danger" : ""}`}>
            {title.length >= MAX_LENGTH - 10
              ? `⚠ あと${MAX_LENGTH - title.length}文字`
              : `${title.length}/${MAX_LENGTH}`}
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
            {/* 選択中は色の反転に加えて ✓ の形でも示す */}
            {filter === value && <span aria-hidden className="mr-1">✓</span>}
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
          {visible.map((todo) =>
            editingId === todo.id ? (
              <li key={todo.id} className="rounded-xl border-2 border-accent bg-surface p-3">
                <form onSubmit={(e) => handleSaveEdit(e, todo)}>
                  <label htmlFor={`edit-${todo.id}`} className="mb-2 block text-base font-semibold text-ink">
                    タスクを編集
                  </label>
                  <input
                    id={`edit-${todo.id}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelEdit();
                    }}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    autoComplete="off"
                    enterKeyHint="done"
                    className="min-h-12 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg text-ink focus:border-accent focus:outline-none"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="min-h-11 rounded-lg border-2 border-line px-4 text-base font-semibold text-ink-soft hover:border-ink-faint"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      className="min-h-11 rounded-lg bg-accent px-4 text-base font-bold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
                    >
                      保存
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={todo.id}
                className="flex items-center gap-1 rounded-xl border-2 border-line bg-surface pr-1"
              >
                <label className="flex min-h-16 flex-1 cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => handleToggle(todo)}
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
                  onClick={() => startEdit(todo)}
                  aria-label={`「${todo.title}」を編集`}
                  className="flex min-h-12 shrink-0 items-center gap-1 rounded-lg px-3 text-base font-semibold text-ink-soft hover:bg-line/50"
                >
                  <PencilIcon />
                  <span className="hidden sm:inline">編集</span>
                </button>
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
            ),
          )}
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

      {!loading && (
        <section aria-labelledby="move-heading" className="mt-10 rounded-xl border-2 border-line bg-surface p-4">
          <h2 id="move-heading" className="text-lg font-bold text-ink">
            データの引っ越し
          </h2>
          <p className="mt-1 text-base text-ink-soft">
            タスクはこのブラウザの中だけに保存されます。別のブラウザやスマホで使うときは、ファイルに書き出して、向こうで読み込んでください。
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleExport}
              disabled={list.length === 0}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-line px-4 text-base font-semibold text-ink hover:border-ink-faint disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              <DownloadIcon />
              ファイルに書き出す
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-line px-4 text-base font-semibold text-ink hover:border-ink-faint"
            >
              <UploadIcon />
              ファイルから読み込む
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
              aria-label="読み込むファイル"
            />
          </div>
        </section>
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-4 pb-6"
      >
        {toast && (
          <div className="pointer-events-auto flex min-h-14 w-full max-w-xl items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2 text-surface shadow-lg">
            <span className="min-w-0 truncate text-base">{toast.message}</span>
            {toast.removed && (
              <button
                type="button"
                onClick={handleUndo}
                className="min-h-11 shrink-0 rounded-lg bg-surface px-4 text-base font-bold text-ink hover:bg-line"
              >
                元に戻す
              </button>
            )}
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

function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 8l5-5 5 5M4 21h16" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
