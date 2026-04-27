# TODO

This file tracks ideas, planned features, and bigger direction changes for the project so they do not vanish into chat history.
Add new feature ideas, spitballed follow-ups, and agreed next steps here as they come up during development.

## Near Term

- Keep robust mode stable and fast on very large exports.
- Add clearer UX around what `Lightweight` vs `Robust` can and cannot do.
- Consider on-demand raw JSON loading in lightweight mode for a selected conversation.
- Consider on-demand attachment/image loading in lightweight mode for a selected conversation or message.
- Add more archive filters using metadata already present in the export.

## Planned Features

- Evolve the backup browser into more of a history manager instead of only a reader.
- Add tagging, favorites, saved views, or collections for conversations.
- Add better timeline-style browsing and resurfacing of older conversations.
- Add richer metadata views for conversations, messages, and attached assets.
- Add export tools for selected slices of the archive instead of only browsing in place.

## Training Data Ideas

- Implement the saved [Nova training dataset exporter plan](./NOVA_TRAINING_PLAN.md).
- Export training-ready prompt/response pairs from selected conversations.
- Export preference or ranking datasets from favored conversations and responses.
- Build memory/profile summaries from long-term usage patterns.
- Create eval sets from conversations that best represent the model behavior worth preserving.
- Add curation tools so the archive can be cleaned before using it as model-training material.

## Longer-Term Direction

- Decide whether the project stays browser-only or eventually grows a local companion app.
- Explore stronger persistence options if browser storage limits start getting in the way.
- Consider a more database-like local index if the history-manager direction becomes the main product.
- Keep the project lightweight until the real long-term shape becomes obvious.
