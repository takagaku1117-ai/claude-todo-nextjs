// localStorage にTodoを保存する小さなストア。
// useSyncExternalStore から読むことで、サーバー描画（データなし）と
// ブラウザ描画（保存データあり）の食い違いを React に任せられる。

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

const STORAGE_KEY = "claude-todo:v1";

let cache: Todo[] | null = null;
const listeners = new Set<() => void>();

function isTodo(value: unknown): value is Todo {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.done === "boolean" &&
    typeof t.createdAt === "number"
  );
}

function readStorage(): Todo[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // 壊れたデータが混ざっていても、読める分だけ使う
    return parseTodos(raw) ?? [];
  } catch {
    return [];
  }
}

/** 書き出したファイルの中身から Todo を取り出す。形が違うファイルなら null */
export function parseTodos(text: string): Todo[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isTodo);
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // 別のタブで変更されたら、このタブにも反映する
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = readStorage();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): Todo[] {
  if (cache === null) cache = readStorage();
  return cache;
}

// サーバーには保存データがないので「まだ読み込んでいない」を表す null を返す
export function getServerSnapshot(): Todo[] | null {
  return null;
}

/** 保存に成功したら true。容量オーバーやプライベートモードでは false */
export function saveTodos(next: Todo[]): boolean {
  cache = next;
  emit();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
