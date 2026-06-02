# SillyTavern - Custom Models+

Fork of LenAnderson's Custom Models extension.

Adds custom model names to every SillyTavern Chat Completion source that exposes a model selector. It also supports per-model request body overrides.

## Features

- Custom model optgroups for OpenAI, Claude, OpenRouter, Google AI Studio, Vertex AI, Custom OpenAI-compatible, Azure OpenAI, and the other Chat Completion sources present in current SillyTavern.
- Persistent selected custom model per source.
- Per-model `Include body YAML` and `Exclude body YAML` overrides.
- Custom source compatibility: per-model body YAML is merged into SillyTavern's built-in Additional Parameters fields before generation.

## Body Override Notes

Overrides are applied to the frontend payload before it is posted to `/api/backends/chat-completions/generate`.

For Custom OpenAI-compatible sources, arbitrary body parameters are passed through SillyTavern's normal `custom_include_body` / `custom_exclude_body` backend handling.

For built-in sources, the override can change fields that the SillyTavern backend reads from the generation payload, such as `temperature`, `top_p`, `top_k`, `max_tokens`, `reasoning_effort`, `stop`, and similar source-supported fields.

| | |
|-|-|
|![](README/stcm-01.png)|![](README/stcm-02.png)|
