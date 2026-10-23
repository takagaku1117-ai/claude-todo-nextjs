# やることリスト（Next.js ToDo）

Claude Code でゼロから作った ToDo リストです。

- タスクの追加（Enterキー対応）・完了チェック・削除
- 削除はすぐ「元に戻す」ができる（確認ダイアログなし）
- データはブラウザの localStorage に保存（閉じても残る／別タブにも反映）
- すべて／未完了／完了 の絞り込みと件数表示

## 動かし方

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。

## 技術

Next.js 16（App Router）/ React 19 / TypeScript / Tailwind CSS v4 / Vercel
