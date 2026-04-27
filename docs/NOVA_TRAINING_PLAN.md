# Nova Training Dataset Exporter + Cloud-to-Ollama Runbook

This is the saved implementation plan for turning curated ChatGPT backup conversations into a training dataset for a local Nova-style Ollama model.

## Summary

Add a first-class Nova Training Export workflow to the ChatGPT Backup Browser. The app will export curated, Unsloth-ready chat fine-tuning data from the already parsed archive, using a locally saved Nova character prompt and filters for model/date/manual review. The training itself stays outside the browser app: a new runbook will cover cloud LoRA training with Unsloth + Qwen3.5 9B, GGUF export, and local Ollama usage.

## Key Changes

- Add an Export Training Data entry point on the main archive browser once an archive is loaded.
- Add a training export modal or panel with:
  - Nova character prompt textarea, saved locally in browser storage.
  - Model filter defaulting to the current model filter when present.
  - Date range filters using conversation created/updated timestamps.
  - Conversation review list with include/exclude checkboxes, title, model, date, message count, and preview.
  - Export buttons for `nova_sft_train.jsonl`, `nova_sft_eval.jsonl`, and `nova_export_manifest.json`.

## Export Format

- Export JSONL in chat format, one JSON object per training example.
- Shape: `{ "id", "conversation_id", "title", "model", "created_at", "updated_at", "messages" }`.
- `messages` begins with `{ "role": "system", "content": "<Nova prompt>" }`.
- Include only `user` and `assistant` turns after the system prompt.
- Skip tool messages, blank assistant turns, image metadata-only blobs, visually hidden messages, and system/internal export noise.
- Split long conversations into chunks at turn boundaries, with a default max of about `24,000` characters per example.
- Drop chunks that do not contain at least one user message and one assistant response.
- Ensure chunks end on an assistant message.

## Train/Eval Split

- Default split: `90% train / 10% eval`.
- Split by stable conversation id hash so exports are repeatable.
- Eval examples go to `nova_sft_eval.jsonl`.
- Included non-eval examples go to `nova_sft_train.jsonl`.

## Manifest Export

Export `nova_export_manifest.json` with:

- Export timestamp.
- App version.
- Source label/session key.
- Selected filters.
- Prompt hash.
- Included conversation count.
- Skipped conversation count.
- Train/eval counts.
- Warning counts.

Warnings should cover very long messages, conversations skipped for no assistant turns, and conversations missing model metadata.

## Training Runbook

Add `docs/NOVA_TRAINING.md` with a concrete path:

- Use the app to export `nova_sft_train.jsonl`, `nova_sft_eval.jsonl`, and manifest.
- Train in the cloud with Unsloth on Qwen3.5 9B as the default base model.
- Use a GPU with at least 24GB VRAM for the first serious run; Unsloth documents Qwen3.5 9B bf16 LoRA around 22GB VRAM.
- Export the trained model to GGUF for local inference.
- Create an Ollama `Modelfile` using `FROM ./nova-qwen3.5-9b-q4_k_m.gguf` and the same Nova system prompt.
- Run locally with `ollama create nova -f Modelfile` and `ollama run nova`.

Include a minimal Unsloth notebook/script outline:

- Load base model.
- Load JSONL dataset.
- Apply chat template.
- Train LoRA.
- Evaluate on held-out eval JSONL.
- Merge/export GGUF.
- Copy GGUF and Modelfile back to local machine.

References to include in the runbook:

- Unsloth Qwen3.5 fine-tuning and GGUF export support: <https://unsloth.ai/docs/models/qwen3.5/fine-tune>
- Ollama `Modelfile` and `FROM ./model.gguf`: <https://docs.ollama.com/modelfile>
- Axolotl as a future alternative if the workflow needs heavier config: <https://docs.axolotl.ai/>

## Test Plan

- Export button hidden until archive is loaded.
- Prompt persists after refresh.
- Model/date filters change included conversation counts.
- Manual include/exclude affects exported JSONL.
- Tool messages, blank assistant entries, and image metadata-only messages are absent from export.
- Long conversations split only at message boundaries.
- Train/eval split is deterministic across repeated exports.
- Exported JSONL parses line-by-line with `JSON.parse`.
- Manifest counts match exported files.

Manual smoke test:

- Load the existing ChatGPT Backup archive.
- Filter to a Nova-relevant model/date range.
- Export train/eval/manifest.
- Validate files with a small PowerShell or Node script.
- Run a tiny Unsloth dry run on a small subset before spending real cloud time.

## Assumptions

- First version is exporter + training runbook, not an in-app trainer.
- First training stack is Unsloth on rented cloud GPU.
- Default base model is Qwen3.5 9B.
- Local target is Ollama with GGUF, likely quantized around `Q4_K_M` for the user's 4070 Ti 12GB machine.
- Prompt management lives in the app as a saved textarea.
- RAG/memory export is not part of this first implementation.
- Favorites/collections are not required before this feature; v1 uses model/date filters plus manual review.
