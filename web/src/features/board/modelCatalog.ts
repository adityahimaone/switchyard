import { useQuery } from "@tanstack/react-query"
import { listExecutorModels } from "@/api"
import { SearchSelectOption } from "@/components/ui/search-select"

export const FALLBACK_DSH_MODELS: SearchSelectOption[] = [
  {
    "value": "deepseek-account:DeepSeek-V4.1-Flash",
    "label": "DeepSeek-V4.1-Flash",
    "badge": "DeepSeek Account",
    "pinned": true
  },
  {
    "value": "deepseek-account:DeepSeek-V4-Pro",
    "label": "DeepSeek-V4-Pro",
    "badge": "DeepSeek Account",
    "pinned": true
  },
  {
    "value": "deepseek:DeepSeek-V4.1-Flash",
    "label": "DeepSeek-V4.1-Flash",
    "badge": "DeepSeek",
    "pinned": true
  },
  {
    "value": "deepseek:DeepSeek-V4-Pro",
    "label": "DeepSeek-V4-Pro",
    "badge": "DeepSeek",
    "pinned": true
  },
  {
    "value": "adit-9router/kiro-cheap-combo-2",
    "label": "Kiro Cheap Combo 2",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/claude-office",
    "label": "Claude Office",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/free-combo-q4-2026",
    "label": "Free Combo Q4 2026",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/codex",
    "label": "Codex",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/f8",
    "label": "F8",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/free",
    "label": "Free",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/god",
    "label": "God Mode",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/cheap",
    "label": "Cheap",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/premium",
    "label": "Premium",
    "badge": "adit-9router",
    "pinned": true
  },
  {
    "value": "adit-9router/nvidia/minimaxai/minimax-m2.7",
    "label": "minimaxai · minimax-m2.7",
    "sublabel": "nvidia/minimaxai/minimax-m2.7",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/minimaxai/minimax-m3",
    "label": "minimaxai · minimax-m3",
    "sublabel": "nvidia/minimaxai/minimax-m3",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/z-ai/glm-5.2",
    "label": "z-ai · glm-5.2",
    "sublabel": "nvidia/z-ai/glm-5.2",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/deepseek-ai/deepseek-v4-pro",
    "label": "deepseek-ai · deepseek-v4-pro",
    "sublabel": "nvidia/deepseek-ai/deepseek-v4-pro",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/deepseek-ai/deepseek-v4-flash",
    "label": "deepseek-ai · deepseek-v4-flash",
    "sublabel": "nvidia/deepseek-ai/deepseek-v4-flash",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/moonshotai/kimi-k2.6",
    "label": "moonshotai · kimi-k2.6",
    "sublabel": "nvidia/moonshotai/kimi-k2.6",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/nemotron-3-ultra-550b-a55b",
    "label": "nemotron-3-ultra-550b-a55b",
    "sublabel": "nvidia/nemotron-3-ultra-550b-a55b",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/nvidia/parakeet-ctc-1.1b-asr",
    "label": "parakeet-ctc-1.1b-asr",
    "sublabel": "nvidia/parakeet-ctc-1.1b-asr",
    "badge": "nvidia"
  },
  {
    "value": "adit-9router/cf/@cf/cloudflare/clef-flash",
    "label": "@cf · cloudflare · clef-flash",
    "sublabel": "cf/@cf/cloudflare/clef-flash",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.2-1b-instruct",
    "label": "@cf · meta · llama-3.2-1b-instruct",
    "sublabel": "cf/@cf/meta/llama-3.2-1b-instruct",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.2-3b-instruct",
    "label": "@cf · meta · llama-3.2-3b-instruct",
    "sublabel": "cf/@cf/meta/llama-3.2-3b-instruct",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.1-8b-instruct-fp8-fast",
    "label": "@cf · meta · llama-3.1-8b-instruct-fp8-fast",
    "sublabel": "cf/@cf/meta/llama-3.1-8b-instruct-fp8-fast",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.1-8b-instruct-awq",
    "label": "@cf · meta · llama-3.1-8b-instruct-awq",
    "sublabel": "cf/@cf/meta/llama-3.1-8b-instruct-awq",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/mistralai/mistral-small-3.1-24b-instruct",
    "label": "@cf · mistralai · mistral-small-3.1-24b-instruct",
    "sublabel": "cf/@cf/mistralai/mistral-small-3.1-24b-instruct",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.1-70b-instruct-fp8-fast",
    "label": "@cf · meta · llama-3.1-70b-instruct-fp8-fast",
    "sublabel": "cf/@cf/meta/llama-3.1-70b-instruct-fp8-fast",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "label": "@cf · meta · llama-3.3-70b-instruct-fp8-fast",
    "sublabel": "cf/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    "label": "@cf · deepseek-ai · deepseek-r1-distill-qwen-32b",
    "sublabel": "cf/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/moonshotai/kimi-k2.5",
    "label": "@cf · moonshotai · kimi-k2.5",
    "sublabel": "cf/@cf/moonshotai/kimi-k2.5",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/moonshotai/kimi-k2.6",
    "label": "@cf · moonshotai · kimi-k2.6",
    "sublabel": "cf/@cf/moonshotai/kimi-k2.6",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/zai-org/glm-4.7-flash",
    "label": "@cf · zai-org · glm-4.7-flash",
    "sublabel": "cf/@cf/zai-org/glm-4.7-flash",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/qwen/qwq-32b",
    "label": "@cf · qwen · qwq-32b",
    "sublabel": "cf/@cf/qwen/qwq-32b",
    "badge": "cf"
  },
  {
    "value": "adit-9router/cf/@cf/qwen/qwen2.5-coder-32b-instruct",
    "label": "@cf · qwen · qwen2.5-coder-32b-instruct",
    "sublabel": "cf/@cf/qwen/qwen2.5-coder-32b-instruct",
    "badge": "cf"
  },
  {
    "value": "adit-9router/ollama/gpt-oss:120b",
    "label": "gpt-oss:120b",
    "sublabel": "ollama/gpt-oss:120b",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/kimi-k2.5",
    "label": "kimi-k2.5",
    "sublabel": "ollama/kimi-k2.5",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/glm-5",
    "label": "glm-5",
    "sublabel": "ollama/glm-5",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/minimax-m2.5",
    "label": "minimax-m2.5",
    "sublabel": "ollama/minimax-m2.5",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/glm-4.7-flash",
    "label": "glm-4.7-flash",
    "sublabel": "ollama/glm-4.7-flash",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/qwen3.5",
    "label": "qwen3.5",
    "sublabel": "ollama/qwen3.5",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "ollama/minimax-m3",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/ollama/deepseek-v4.1-flash:cloud",
    "label": "deepseek-v4.1-flash:cloud",
    "sublabel": "ollama/deepseek-v4.1-flash:cloud",
    "badge": "ollama"
  },
  {
    "value": "adit-9router/cmc/deepseek/deepseek-v4-pro",
    "label": "deepseek · deepseek-v4-pro",
    "sublabel": "cmc/deepseek/deepseek-v4-pro",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/deepseek/deepseek-v4-flash",
    "label": "deepseek · deepseek-v4-flash",
    "sublabel": "cmc/deepseek/deepseek-v4-flash",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/moonshotai/Kimi-K2.7-Code",
    "label": "moonshotai · Kimi-K2.7-Code",
    "sublabel": "cmc/moonshotai/Kimi-K2.7-Code",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/moonshotai/Kimi-K2.7-Code-Highspeed",
    "label": "moonshotai · Kimi-K2.7-Code-Highspeed",
    "sublabel": "cmc/moonshotai/Kimi-K2.7-Code-Highspeed",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/moonshotai/Kimi-K2.6",
    "label": "moonshotai · Kimi-K2.6",
    "sublabel": "cmc/moonshotai/Kimi-K2.6",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/moonshotai/Kimi-K2.5",
    "label": "moonshotai · Kimi-K2.5",
    "sublabel": "cmc/moonshotai/Kimi-K2.5",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/zai-org/GLM-5.2",
    "label": "zai-org · GLM-5.2",
    "sublabel": "cmc/zai-org/GLM-5.2",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/zai-org/GLM-5.2-Fast",
    "label": "zai-org · GLM-5.2-Fast",
    "sublabel": "cmc/zai-org/GLM-5.2-Fast",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/zai-org/GLM-5.1",
    "label": "zai-org · GLM-5.1",
    "sublabel": "cmc/zai-org/GLM-5.1",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/zai-org/GLM-5",
    "label": "zai-org · GLM-5",
    "sublabel": "cmc/zai-org/GLM-5",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/MiniMaxAI/MiniMax-M3",
    "label": "MiniMaxAI · MiniMax-M3",
    "sublabel": "cmc/MiniMaxAI/MiniMax-M3",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/MiniMaxAI/MiniMax-M2.7",
    "label": "MiniMaxAI · MiniMax-M2.7",
    "sublabel": "cmc/MiniMaxAI/MiniMax-M2.7",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/MiniMaxAI/MiniMax-M2.5",
    "label": "MiniMaxAI · MiniMax-M2.5",
    "sublabel": "cmc/MiniMaxAI/MiniMax-M2.5",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/xiaomi/mimo-v2.5-pro",
    "label": "xiaomi · mimo-v2.5-pro",
    "sublabel": "cmc/xiaomi/mimo-v2.5-pro",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/xiaomi/mimo-v2.5",
    "label": "xiaomi · mimo-v2.5",
    "sublabel": "cmc/xiaomi/mimo-v2.5",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/Qwen/Qwen3.6-Max-Preview",
    "label": "Qwen · Qwen3.6-Max-Preview",
    "sublabel": "cmc/Qwen/Qwen3.6-Max-Preview",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/Qwen/Qwen3.6-Plus",
    "label": "Qwen · Qwen3.6-Plus",
    "sublabel": "cmc/Qwen/Qwen3.6-Plus",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/Qwen/Qwen3.7-Max",
    "label": "Qwen · Qwen3.7-Max",
    "sublabel": "cmc/Qwen/Qwen3.7-Max",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/Qwen/Qwen3.7-Plus",
    "label": "Qwen · Qwen3.7-Plus",
    "sublabel": "cmc/Qwen/Qwen3.7-Plus",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/stepfun/Step-3.7-Flash",
    "label": "stepfun · Step-3.7-Flash",
    "sublabel": "cmc/stepfun/Step-3.7-Flash",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/stepfun/Step-3.5-Flash",
    "label": "stepfun · Step-3.5-Flash",
    "sublabel": "cmc/stepfun/Step-3.5-Flash",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/cmc/nvidia/nemotron-3-ultra-550b-a55b",
    "label": "nvidia · nemotron-3-ultra-550b-a55b",
    "sublabel": "cmc/nvidia/nemotron-3-ultra-550b-a55b",
    "badge": "cmc"
  },
  {
    "value": "adit-9router/gemini/gemini-3.8-flash",
    "label": "gemini-3.8-flash",
    "sublabel": "gemini/gemini-3.8-flash",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3.7-flash",
    "label": "gemini-3.7-flash",
    "sublabel": "gemini/gemini-3.7-flash",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3.6-flash",
    "label": "gemini-3.6-flash",
    "sublabel": "gemini/gemini-3.6-flash",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3.5-flash-lite",
    "label": "gemini-3.5-flash-lite",
    "sublabel": "gemini/gemini-3.5-flash-lite",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3.1-pro-preview",
    "label": "gemini-3.1-pro-preview",
    "sublabel": "gemini/gemini-3.1-pro-preview",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3.1-flash-lite-preview",
    "label": "gemini-3.1-flash-lite-preview",
    "sublabel": "gemini/gemini-3.1-flash-lite-preview",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemini-3-flash-preview",
    "label": "gemini-3-flash-preview",
    "sublabel": "gemini/gemini-3-flash-preview",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/gemini/gemma-4-31b-it",
    "label": "gemma-4-31b-it",
    "sublabel": "gemini/gemma-4-31b-it",
    "badge": "gemini"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "xmtp/mimo-v2.5-pro",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5-pro-claude",
    "label": "mimo-v2.5-pro-claude",
    "sublabel": "xmtp/mimo-v2.5-pro-claude",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "xmtp/mimo-v2.5",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2-pro",
    "label": "mimo-v2-pro",
    "sublabel": "xmtp/mimo-v2-pro",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2-omni",
    "label": "mimo-v2-omni",
    "sublabel": "xmtp/mimo-v2-omni",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2-tts",
    "label": "mimo-v2-tts",
    "sublabel": "xmtp/mimo-v2-tts",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5-tts",
    "label": "mimo-v2.5-tts",
    "sublabel": "xmtp/mimo-v2.5-tts",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5-tts-voiceclone",
    "label": "mimo-v2.5-tts-voiceclone",
    "sublabel": "xmtp/mimo-v2.5-tts-voiceclone",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/xmtp/mimo-v2.5-tts-voicedesign",
    "label": "mimo-v2.5-tts-voicedesign",
    "sublabel": "xmtp/mimo-v2.5-tts-voicedesign",
    "badge": "xmtp"
  },
  {
    "value": "adit-9router/kr/claude-opus-5.5",
    "label": "claude-opus-5.5",
    "sublabel": "kr/claude-opus-5.5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5.5-thinking",
    "label": "claude-opus-5.5-thinking",
    "sublabel": "kr/claude-opus-5.5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5.5-agentic",
    "label": "claude-opus-5.5-agentic",
    "sublabel": "kr/claude-opus-5.5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5.5-thinking-agentic",
    "label": "claude-opus-5.5-thinking-agentic",
    "sublabel": "kr/claude-opus-5.5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5",
    "label": "claude-opus-5",
    "sublabel": "kr/claude-opus-5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5-thinking",
    "label": "claude-opus-5-thinking",
    "sublabel": "kr/claude-opus-5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5-agentic",
    "label": "claude-opus-5-agentic",
    "sublabel": "kr/claude-opus-5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-5-thinking-agentic",
    "label": "claude-opus-5-thinking-agentic",
    "sublabel": "kr/claude-opus-5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.8",
    "label": "claude-opus-4.8",
    "sublabel": "kr/claude-opus-4.8",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.8-thinking",
    "label": "claude-opus-4.8-thinking",
    "sublabel": "kr/claude-opus-4.8-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.8-agentic",
    "label": "claude-opus-4.8-agentic",
    "sublabel": "kr/claude-opus-4.8-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.8-thinking-agentic",
    "label": "claude-opus-4.8-thinking-agentic",
    "sublabel": "kr/claude-opus-4.8-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.7",
    "label": "claude-opus-4.7",
    "sublabel": "kr/claude-opus-4.7",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.7-thinking",
    "label": "claude-opus-4.7-thinking",
    "sublabel": "kr/claude-opus-4.7-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.7-agentic",
    "label": "claude-opus-4.7-agentic",
    "sublabel": "kr/claude-opus-4.7-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.7-thinking-agentic",
    "label": "claude-opus-4.7-thinking-agentic",
    "sublabel": "kr/claude-opus-4.7-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.5",
    "label": "claude-opus-4.5",
    "sublabel": "kr/claude-opus-4.5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.5-thinking",
    "label": "claude-opus-4.5-thinking",
    "sublabel": "kr/claude-opus-4.5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.5-agentic",
    "label": "claude-opus-4.5-agentic",
    "sublabel": "kr/claude-opus-4.5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.5-thinking-agentic",
    "label": "claude-opus-4.5-thinking-agentic",
    "sublabel": "kr/claude-opus-4.5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-5",
    "label": "claude-sonnet-5",
    "sublabel": "kr/claude-sonnet-5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-4.5",
    "label": "claude-sonnet-4.5",
    "sublabel": "kr/claude-sonnet-4.5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-haiku-4.5",
    "label": "claude-haiku-4.5",
    "sublabel": "kr/claude-haiku-4.5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/deepseek-3.2",
    "label": "deepseek-3.2",
    "sublabel": "kr/deepseek-3.2",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/qwen3-coder-next",
    "label": "qwen3-coder-next",
    "sublabel": "kr/qwen3-coder-next",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/glm-5",
    "label": "glm-5",
    "sublabel": "kr/glm-5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/MiniMax-M2.5",
    "label": "MiniMax-M2.5",
    "sublabel": "kr/MiniMax-M2.5",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "kr/gpt-5.6-sol",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "kr/gpt-5.6-terra",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "kr/gpt-5.6-luna",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-5-thinking",
    "label": "claude-sonnet-5-thinking",
    "sublabel": "kr/claude-sonnet-5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-4.5-thinking",
    "label": "claude-sonnet-4.5-thinking",
    "sublabel": "kr/claude-sonnet-4.5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-haiku-4.5-thinking",
    "label": "claude-haiku-4.5-thinking",
    "sublabel": "kr/claude-haiku-4.5-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-sol-thinking",
    "label": "gpt-5.6-sol-thinking",
    "sublabel": "kr/gpt-5.6-sol-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-terra-thinking",
    "label": "gpt-5.6-terra-thinking",
    "sublabel": "kr/gpt-5.6-terra-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-luna-thinking",
    "label": "gpt-5.6-luna-thinking",
    "sublabel": "kr/gpt-5.6-luna-thinking",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-5-agentic",
    "label": "claude-sonnet-5-agentic",
    "sublabel": "kr/claude-sonnet-5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-4.5-agentic",
    "label": "claude-sonnet-4.5-agentic",
    "sublabel": "kr/claude-sonnet-4.5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-haiku-4.5-agentic",
    "label": "claude-haiku-4.5-agentic",
    "sublabel": "kr/claude-haiku-4.5-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-sol-agentic",
    "label": "gpt-5.6-sol-agentic",
    "sublabel": "kr/gpt-5.6-sol-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-terra-agentic",
    "label": "gpt-5.6-terra-agentic",
    "sublabel": "kr/gpt-5.6-terra-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-luna-agentic",
    "label": "gpt-5.6-luna-agentic",
    "sublabel": "kr/gpt-5.6-luna-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-5-thinking-agentic",
    "label": "claude-sonnet-5-thinking-agentic",
    "sublabel": "kr/claude-sonnet-5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-sonnet-4.5-thinking-agentic",
    "label": "claude-sonnet-4.5-thinking-agentic",
    "sublabel": "kr/claude-sonnet-4.5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-haiku-4.5-thinking-agentic",
    "label": "claude-haiku-4.5-thinking-agentic",
    "sublabel": "kr/claude-haiku-4.5-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-sol-thinking-agentic",
    "label": "gpt-5.6-sol-thinking-agentic",
    "sublabel": "kr/gpt-5.6-sol-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-terra-thinking-agentic",
    "label": "gpt-5.6-terra-thinking-agentic",
    "sublabel": "kr/gpt-5.6-terra-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/gpt-5.6-luna-thinking-agentic",
    "label": "gpt-5.6-luna-thinking-agentic",
    "sublabel": "kr/gpt-5.6-luna-thinking-agentic",
    "badge": "kr"
  },
  {
    "value": "adit-9router/kr/claude-opus-4.6",
    "label": "claude-opus-4.6",
    "sublabel": "kr/claude-opus-4.6",
    "badge": "kr"
  },
  {
    "value": "adit-9router/9office/claude-combo",
    "label": "claude-combo",
    "sublabel": "9office/claude-combo",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/free-combo",
    "label": "free-combo",
    "sublabel": "9office/free-combo",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/mimo-combo",
    "label": "mimo-combo",
    "sublabel": "9office/mimo-combo",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/free-combo-2",
    "label": "free-combo-2",
    "sublabel": "9office/free-combo-2",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/claude-haiku-combo",
    "label": "claude-haiku-combo",
    "sublabel": "9office/claude-haiku-combo",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-5",
    "label": "kr · claude-opus-5",
    "sublabel": "9office/kr/claude-opus-5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-5-thinking",
    "label": "kr · claude-opus-5-thinking",
    "sublabel": "9office/kr/claude-opus-5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-5-agentic",
    "label": "kr · claude-opus-5-agentic",
    "sublabel": "9office/kr/claude-opus-5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-5-thinking-agentic",
    "label": "kr · claude-opus-5-thinking-agentic",
    "sublabel": "9office/kr/claude-opus-5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.8",
    "label": "kr · claude-opus-4.8",
    "sublabel": "9office/kr/claude-opus-4.8",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.8-thinking",
    "label": "kr · claude-opus-4.8-thinking",
    "sublabel": "9office/kr/claude-opus-4.8-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.8-agentic",
    "label": "kr · claude-opus-4.8-agentic",
    "sublabel": "9office/kr/claude-opus-4.8-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.8-thinking-agentic",
    "label": "kr · claude-opus-4.8-thinking-agentic",
    "sublabel": "9office/kr/claude-opus-4.8-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.7",
    "label": "kr · claude-opus-4.7",
    "sublabel": "9office/kr/claude-opus-4.7",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.7-thinking",
    "label": "kr · claude-opus-4.7-thinking",
    "sublabel": "9office/kr/claude-opus-4.7-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.7-agentic",
    "label": "kr · claude-opus-4.7-agentic",
    "sublabel": "9office/kr/claude-opus-4.7-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.7-thinking-agentic",
    "label": "kr · claude-opus-4.7-thinking-agentic",
    "sublabel": "9office/kr/claude-opus-4.7-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.5",
    "label": "kr · claude-opus-4.5",
    "sublabel": "9office/kr/claude-opus-4.5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.5-thinking",
    "label": "kr · claude-opus-4.5-thinking",
    "sublabel": "9office/kr/claude-opus-4.5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.5-agentic",
    "label": "kr · claude-opus-4.5-agentic",
    "sublabel": "9office/kr/claude-opus-4.5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.5-thinking-agentic",
    "label": "kr · claude-opus-4.5-thinking-agentic",
    "sublabel": "9office/kr/claude-opus-4.5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-5",
    "label": "kr · claude-sonnet-5",
    "sublabel": "9office/kr/claude-sonnet-5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.5",
    "label": "kr · claude-sonnet-4.5",
    "sublabel": "9office/kr/claude-sonnet-4.5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-haiku-4.5",
    "label": "kr · claude-haiku-4.5",
    "sublabel": "9office/kr/claude-haiku-4.5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/deepseek-3.2",
    "label": "kr · deepseek-3.2",
    "sublabel": "9office/kr/deepseek-3.2",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/qwen3-coder-next",
    "label": "kr · qwen3-coder-next",
    "sublabel": "9office/kr/qwen3-coder-next",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/glm-5",
    "label": "kr · glm-5",
    "sublabel": "9office/kr/glm-5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/MiniMax-M2.5",
    "label": "kr · MiniMax-M2.5",
    "sublabel": "9office/kr/MiniMax-M2.5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-sol",
    "label": "kr · gpt-5.6-sol",
    "sublabel": "9office/kr/gpt-5.6-sol",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-terra",
    "label": "kr · gpt-5.6-terra",
    "sublabel": "9office/kr/gpt-5.6-terra",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-luna",
    "label": "kr · gpt-5.6-luna",
    "sublabel": "9office/kr/gpt-5.6-luna",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-5-thinking",
    "label": "kr · claude-sonnet-5-thinking",
    "sublabel": "9office/kr/claude-sonnet-5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.5-thinking",
    "label": "kr · claude-sonnet-4.5-thinking",
    "sublabel": "9office/kr/claude-sonnet-4.5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-haiku-4.5-thinking",
    "label": "kr · claude-haiku-4.5-thinking",
    "sublabel": "9office/kr/claude-haiku-4.5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-sol-thinking",
    "label": "kr · gpt-5.6-sol-thinking",
    "sublabel": "9office/kr/gpt-5.6-sol-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-terra-thinking",
    "label": "kr · gpt-5.6-terra-thinking",
    "sublabel": "9office/kr/gpt-5.6-terra-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-luna-thinking",
    "label": "kr · gpt-5.6-luna-thinking",
    "sublabel": "9office/kr/gpt-5.6-luna-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-5-agentic",
    "label": "kr · claude-sonnet-5-agentic",
    "sublabel": "9office/kr/claude-sonnet-5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.5-agentic",
    "label": "kr · claude-sonnet-4.5-agentic",
    "sublabel": "9office/kr/claude-sonnet-4.5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-haiku-4.5-agentic",
    "label": "kr · claude-haiku-4.5-agentic",
    "sublabel": "9office/kr/claude-haiku-4.5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-sol-agentic",
    "label": "kr · gpt-5.6-sol-agentic",
    "sublabel": "9office/kr/gpt-5.6-sol-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-terra-agentic",
    "label": "kr · gpt-5.6-terra-agentic",
    "sublabel": "9office/kr/gpt-5.6-terra-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-luna-agentic",
    "label": "kr · gpt-5.6-luna-agentic",
    "sublabel": "9office/kr/gpt-5.6-luna-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-5-thinking-agentic",
    "label": "kr · claude-sonnet-5-thinking-agentic",
    "sublabel": "9office/kr/claude-sonnet-5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.5-thinking-agentic",
    "label": "kr · claude-sonnet-4.5-thinking-agentic",
    "sublabel": "9office/kr/claude-sonnet-4.5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-haiku-4.5-thinking-agentic",
    "label": "kr · claude-haiku-4.5-thinking-agentic",
    "sublabel": "9office/kr/claude-haiku-4.5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-sol-thinking-agentic",
    "label": "kr · gpt-5.6-sol-thinking-agentic",
    "sublabel": "9office/kr/gpt-5.6-sol-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-terra-thinking-agentic",
    "label": "kr · gpt-5.6-terra-thinking-agentic",
    "sublabel": "9office/kr/gpt-5.6-terra-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/gpt-5.6-luna-thinking-agentic",
    "label": "kr · gpt-5.6-luna-thinking-agentic",
    "sublabel": "9office/kr/gpt-5.6-luna-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.6",
    "label": "kr · claude-sonnet-4.6",
    "sublabel": "9office/kr/claude-sonnet-4.6",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/auto",
    "label": "kr · auto",
    "sublabel": "9office/kr/auto",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/auto-thinking",
    "label": "kr · auto-thinking",
    "sublabel": "9office/kr/auto-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.6",
    "label": "kr · claude-opus-4.6",
    "sublabel": "9office/kr/claude-opus-4.6",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.6-thinking",
    "label": "kr · claude-opus-4.6-thinking",
    "sublabel": "9office/kr/claude-opus-4.6-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.6-agentic",
    "label": "kr · claude-opus-4.6-agentic",
    "sublabel": "9office/kr/claude-opus-4.6-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-opus-4.6-thinking-agentic",
    "label": "kr · claude-opus-4.6-thinking-agentic",
    "sublabel": "9office/kr/claude-opus-4.6-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.6-thinking",
    "label": "kr · claude-sonnet-4.6-thinking",
    "sublabel": "9office/kr/claude-sonnet-4.6-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.6-agentic",
    "label": "kr · claude-sonnet-4.6-agentic",
    "sublabel": "9office/kr/claude-sonnet-4.6-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4.6-thinking-agentic",
    "label": "kr · claude-sonnet-4.6-thinking-agentic",
    "sublabel": "9office/kr/claude-sonnet-4.6-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4",
    "label": "kr · claude-sonnet-4",
    "sublabel": "9office/kr/claude-sonnet-4",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4-thinking",
    "label": "kr · claude-sonnet-4-thinking",
    "sublabel": "9office/kr/claude-sonnet-4-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4-agentic",
    "label": "kr · claude-sonnet-4-agentic",
    "sublabel": "9office/kr/claude-sonnet-4-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/claude-sonnet-4-thinking-agentic",
    "label": "kr · claude-sonnet-4-thinking-agentic",
    "sublabel": "9office/kr/claude-sonnet-4-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/deepseek-3.2-thinking",
    "label": "kr · deepseek-3.2-thinking",
    "sublabel": "9office/kr/deepseek-3.2-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/deepseek-3.2-agentic",
    "label": "kr · deepseek-3.2-agentic",
    "sublabel": "9office/kr/deepseek-3.2-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/deepseek-3.2-thinking-agentic",
    "label": "kr · deepseek-3.2-thinking-agentic",
    "sublabel": "9office/kr/deepseek-3.2-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.5",
    "label": "kr · minimax-m2.5",
    "sublabel": "9office/kr/minimax-m2.5",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.5-thinking",
    "label": "kr · minimax-m2.5-thinking",
    "sublabel": "9office/kr/minimax-m2.5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.5-agentic",
    "label": "kr · minimax-m2.5-agentic",
    "sublabel": "9office/kr/minimax-m2.5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.5-thinking-agentic",
    "label": "kr · minimax-m2.5-thinking-agentic",
    "sublabel": "9office/kr/minimax-m2.5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.1",
    "label": "kr · minimax-m2.1",
    "sublabel": "9office/kr/minimax-m2.1",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.1-thinking",
    "label": "kr · minimax-m2.1-thinking",
    "sublabel": "9office/kr/minimax-m2.1-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.1-agentic",
    "label": "kr · minimax-m2.1-agentic",
    "sublabel": "9office/kr/minimax-m2.1-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/minimax-m2.1-thinking-agentic",
    "label": "kr · minimax-m2.1-thinking-agentic",
    "sublabel": "9office/kr/minimax-m2.1-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/glm-5-thinking",
    "label": "kr · glm-5-thinking",
    "sublabel": "9office/kr/glm-5-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/glm-5-agentic",
    "label": "kr · glm-5-agentic",
    "sublabel": "9office/kr/glm-5-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/glm-5-thinking-agentic",
    "label": "kr · glm-5-thinking-agentic",
    "sublabel": "9office/kr/glm-5-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/qwen3-coder-next-thinking",
    "label": "kr · qwen3-coder-next-thinking",
    "sublabel": "9office/kr/qwen3-coder-next-thinking",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/qwen3-coder-next-agentic",
    "label": "kr · qwen3-coder-next-agentic",
    "sublabel": "9office/kr/qwen3-coder-next-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/9office/kr/qwen3-coder-next-thinking-agentic",
    "label": "kr · qwen3-coder-next-thinking-agentic",
    "sublabel": "9office/kr/qwen3-coder-next-thinking-agentic",
    "badge": "9office"
  },
  {
    "value": "adit-9router/openai/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "openai/gpt-5.5",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5.4",
    "label": "gpt-5.4",
    "sublabel": "openai/gpt-5.4",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5.4-mini",
    "label": "gpt-5.4-mini",
    "sublabel": "openai/gpt-5.4-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5.4-nano",
    "label": "gpt-5.4-nano",
    "sublabel": "openai/gpt-5.4-nano",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5.2",
    "label": "gpt-5.2",
    "sublabel": "openai/gpt-5.2",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5.1",
    "label": "gpt-5.1",
    "sublabel": "openai/gpt-5.1",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5",
    "label": "gpt-5",
    "sublabel": "openai/gpt-5",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5-mini",
    "label": "gpt-5-mini",
    "sublabel": "openai/gpt-5-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-5-nano",
    "label": "gpt-5-nano",
    "sublabel": "openai/gpt-5-nano",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4o",
    "label": "gpt-4o",
    "sublabel": "openai/gpt-4o",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4o-mini",
    "label": "gpt-4o-mini",
    "sublabel": "openai/gpt-4o-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4-turbo",
    "label": "gpt-4-turbo",
    "sublabel": "openai/gpt-4-turbo",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4.1",
    "label": "gpt-4.1",
    "sublabel": "openai/gpt-4.1",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4.1-mini",
    "label": "gpt-4.1-mini",
    "sublabel": "openai/gpt-4.1-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/gpt-4.1-nano",
    "label": "gpt-4.1-nano",
    "sublabel": "openai/gpt-4.1-nano",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o3",
    "label": "o3",
    "sublabel": "openai/o3",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o3-mini",
    "label": "o3-mini",
    "sublabel": "openai/o3-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o3-pro",
    "label": "o3-pro",
    "sublabel": "openai/o3-pro",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o4-mini",
    "label": "o4-mini",
    "sublabel": "openai/o4-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o1",
    "label": "o1",
    "sublabel": "openai/o1",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openai/o1-mini",
    "label": "o1-mini",
    "sublabel": "openai/o1-mini",
    "badge": "openai"
  },
  {
    "value": "adit-9router/openrouter/typesafe/jev-1.13",
    "label": "typesafe · jev-1.13",
    "sublabel": "openrouter/typesafe/jev-1.13",
    "badge": "openrouter"
  },
  {
    "value": "adit-9router/openrouter/google/gemma-4-31b-it:free",
    "label": "google · gemma-4-31b-it:free",
    "sublabel": "openrouter/google/gemma-4-31b-it:free",
    "badge": "openrouter"
  },
  {
    "value": "adit-9router/openrouter/nvidia/nemotron-3-nano-30b-a3b:free",
    "label": "nvidia · nemotron-3-nano-30b-a3b:free",
    "sublabel": "openrouter/nvidia/nemotron-3-nano-30b-a3b:free",
    "badge": "openrouter"
  },
  {
    "value": "adit-9router/openrouter/nvidia/nemotron-3-super-120b-a12b:free",
    "label": "nvidia · nemotron-3-super-120b-a12b:free",
    "sublabel": "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
    "badge": "openrouter"
  },
  {
    "value": "adit-9router/openrouter/nex-agi/nex-n2-pro:free",
    "label": "nex-agi · nex-n2-pro:free",
    "sublabel": "openrouter/nex-agi/nex-n2-pro:free",
    "badge": "openrouter"
  },
  {
    "value": "adit-9router/ov/orvix/atria-dawn-preview",
    "label": "orvix · atria-dawn-preview",
    "sublabel": "ov/orvix/atria-dawn-preview",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/auto",
    "label": "orvix · auto",
    "sublabel": "ov/orvix/auto",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/deepseek-v4-flash",
    "label": "orvix · deepseek-v4-flash",
    "sublabel": "ov/orvix/deepseek-v4-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/deepseek-v4-pro",
    "label": "orvix · deepseek-v4-pro",
    "sublabel": "ov/orvix/deepseek-v4-pro",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/deepseek-v4.1-flash",
    "label": "orvix · deepseek-v4.1-flash",
    "sublabel": "ov/orvix/deepseek-v4.1-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/flux-2-pro",
    "label": "orvix · flux-2-pro",
    "sublabel": "ov/orvix/flux-2-pro",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gemini-3-pro-image",
    "label": "orvix · gemini-3-pro-image",
    "sublabel": "ov/orvix/gemini-3-pro-image",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gemini-3.7-flash",
    "label": "orvix · gemini-3.7-flash",
    "sublabel": "ov/orvix/gemini-3.7-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gemini-3.8-flash",
    "label": "orvix · gemini-3.8-flash",
    "sublabel": "ov/orvix/gemini-3.8-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/glm-5.2",
    "label": "orvix · glm-5.2",
    "sublabel": "ov/orvix/glm-5.2",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/glm-5.3-flash",
    "label": "orvix · glm-5.3-flash",
    "sublabel": "ov/orvix/glm-5.3-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gpt-5.6-luna",
    "label": "orvix · gpt-5.6-luna",
    "sublabel": "ov/orvix/gpt-5.6-luna",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gpt-5.6-sol",
    "label": "orvix · gpt-5.6-sol",
    "sublabel": "ov/orvix/gpt-5.6-sol",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gpt-5.6-terra",
    "label": "orvix · gpt-5.6-terra",
    "sublabel": "ov/orvix/gpt-5.6-terra",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gpt-image-2",
    "label": "orvix · gpt-image-2",
    "sublabel": "ov/orvix/gpt-image-2",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/grok-4.7",
    "label": "orvix · grok-4.7",
    "sublabel": "ov/orvix/grok-4.7",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/grok-imagine-image",
    "label": "orvix · grok-imagine-image",
    "sublabel": "ov/orvix/grok-imagine-image",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/hy3",
    "label": "orvix · hy3",
    "sublabel": "ov/orvix/hy3",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/hy4-preview",
    "label": "orvix · hy4-preview",
    "sublabel": "ov/orvix/hy4-preview",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/jev",
    "label": "orvix · jev",
    "sublabel": "ov/orvix/jev",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/kimi-k3",
    "label": "orvix · kimi-k3",
    "sublabel": "ov/orvix/kimi-k3",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/midjourney",
    "label": "orvix · midjourney",
    "sublabel": "ov/orvix/midjourney",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/mimo-v2.5",
    "label": "orvix · mimo-v2.5",
    "sublabel": "ov/orvix/mimo-v2.5",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/mimo-v2.5-pro",
    "label": "orvix · mimo-v2.5-pro",
    "sublabel": "ov/orvix/mimo-v2.5-pro",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/mimo-v2.6-pro",
    "label": "orvix · mimo-v2.6-pro",
    "sublabel": "ov/orvix/mimo-v2.6-pro",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/minimax-m3",
    "label": "orvix · minimax-m3",
    "sublabel": "ov/orvix/minimax-m3",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/qwen-3.8-flash",
    "label": "orvix · qwen-3.8-flash",
    "sublabel": "ov/orvix/qwen-3.8-flash",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/qwen-3.8-max",
    "label": "orvix · qwen-3.8-max",
    "sublabel": "ov/orvix/qwen-3.8-max",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/qwen-image-3.0",
    "label": "orvix · qwen-image-3.0",
    "sublabel": "ov/orvix/qwen-image-3.0",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/seedream-5.0-pro",
    "label": "orvix · seedream-5.0-pro",
    "sublabel": "ov/orvix/seedream-5.0-pro",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/muse-spark-1.2",
    "label": "orvix · muse-spark-1.2",
    "sublabel": "ov/orvix/muse-spark-1.2",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/claude-opus-5",
    "label": "orvix · claude-opus-5",
    "sublabel": "ov/orvix/claude-opus-5",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/deepseek-v4-flash:free",
    "label": "orvix · deepseek-v4-flash:free",
    "sublabel": "ov/orvix/deepseek-v4-flash:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gemini-3.5-flash:free",
    "label": "orvix · gemini-3.5-flash:free",
    "sublabel": "ov/orvix/gemini-3.5-flash:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/glm-5.3-flash:free",
    "label": "orvix · glm-5.3-flash:free",
    "sublabel": "ov/orvix/glm-5.3-flash:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/gpt-5.6-luna:free",
    "label": "orvix · gpt-5.6-luna:free",
    "sublabel": "ov/orvix/gpt-5.6-luna:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/grok-4.3:free",
    "label": "orvix · grok-4.3:free",
    "sublabel": "ov/orvix/grok-4.3:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/ov/orvix/grok-4.7:free",
    "label": "orvix · grok-4.7:free",
    "sublabel": "ov/orvix/grok-4.7:free",
    "badge": "ov"
  },
  {
    "value": "adit-9router/cx/gpt-6.1-sol",
    "label": "gpt-6.1-sol",
    "sublabel": "cx/gpt-6.1-sol",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-astra",
    "label": "gpt-6-astra",
    "sublabel": "cx/gpt-6-astra",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-astra[1m]",
    "label": "gpt-6-astra[1m]",
    "sublabel": "cx/gpt-6-astra[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-sol",
    "label": "gpt-6-sol",
    "sublabel": "cx/gpt-6-sol",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-sol[1m]",
    "label": "gpt-6-sol[1m]",
    "sublabel": "cx/gpt-6-sol[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "cx/gpt-6-luna",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-6-luna[1m]",
    "label": "gpt-6-luna[1m]",
    "sublabel": "cx/gpt-6-luna[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "cx/gpt-5.6-sol",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-sol[1m]",
    "label": "gpt-5.6-sol[1m]",
    "sublabel": "cx/gpt-5.6-sol[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-sol-review",
    "label": "gpt-5.6-sol-review",
    "sublabel": "cx/gpt-5.6-sol-review",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "cx/gpt-5.6-terra",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-terra[1m]",
    "label": "gpt-5.6-terra[1m]",
    "sublabel": "cx/gpt-5.6-terra[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-terra-review",
    "label": "gpt-5.6-terra-review",
    "sublabel": "cx/gpt-5.6-terra-review",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "cx/gpt-5.6-luna",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-luna[1m]",
    "label": "gpt-5.6-luna[1m]",
    "sublabel": "cx/gpt-5.6-luna[1m]",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.6-luna-review",
    "label": "gpt-5.6-luna-review",
    "sublabel": "cx/gpt-5.6-luna-review",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "cx/gpt-5.5",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-5.5-review",
    "label": "gpt-5.5-review",
    "sublabel": "cx/gpt-5.5-review",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-daybreak-blue-latest",
    "label": "gpt-daybreak-blue-latest",
    "sublabel": "cx/gpt-daybreak-blue-latest",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/gpt-reserve",
    "label": "gpt-reserve",
    "sublabel": "cx/gpt-reserve",
    "badge": "cx"
  },
  {
    "value": "adit-9router/cx/codex-auto-review",
    "label": "codex-auto-review",
    "sublabel": "cx/codex-auto-review",
    "badge": "cx"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-sonnet-4.6",
    "label": "anthropic · claude-sonnet-4.6",
    "sublabel": "vk/anthropic/claude-sonnet-4.6",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-opus-4.6",
    "label": "anthropic · claude-opus-4.6",
    "sublabel": "vk/anthropic/claude-opus-4.6",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-opus-4.8",
    "label": "anthropic · claude-opus-4.8",
    "sublabel": "vk/anthropic/claude-opus-4.8",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-opus-4.7",
    "label": "anthropic · claude-opus-4.7",
    "sublabel": "vk/anthropic/claude-opus-4.7",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-5.6-terra",
    "label": "openai · gpt-5.6-terra",
    "sublabel": "vk/openai/gpt-5.6-terra",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-5.6-sol",
    "label": "openai · gpt-5.6-sol",
    "sublabel": "vk/openai/gpt-5.6-sol",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/vikey/qwen3.8-27b-uncensored",
    "label": "vikey · qwen3.8-27b-uncensored",
    "sublabel": "vk/vikey/qwen3.8-27b-uncensored",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/deepseek/deepseek-v4-flash",
    "label": "deepseek · deepseek-v4-flash",
    "sublabel": "vk/deepseek/deepseek-v4-flash",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-opus-5",
    "label": "anthropic · claude-opus-5",
    "sublabel": "vk/anthropic/claude-opus-5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-sonnet-5",
    "label": "anthropic · claude-sonnet-5",
    "sublabel": "vk/anthropic/claude-sonnet-5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-fable-5",
    "label": "anthropic · claude-fable-5",
    "sublabel": "vk/anthropic/claude-fable-5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/deepseek/deepseek-v4-pro",
    "label": "deepseek · deepseek-v4-pro",
    "sublabel": "vk/deepseek/deepseek-v4-pro",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/moonshot/kimi-k3",
    "label": "moonshot · kimi-k3",
    "sublabel": "vk/moonshot/kimi-k3",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/moonshot/kimi-k2.7-code",
    "label": "moonshot · kimi-k2.7-code",
    "sublabel": "vk/moonshot/kimi-k2.7-code",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/zai/glm-5.3",
    "label": "zai · glm-5.3",
    "sublabel": "vk/zai/glm-5.3",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/glm/glm-5.3-flash",
    "label": "glm · glm-5.3-flash",
    "sublabel": "vk/glm/glm-5.3-flash",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/qwen/qwen3.8-max",
    "label": "qwen · qwen3.8-max",
    "sublabel": "vk/qwen/qwen3.8-max",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/minimax/minimax-m3",
    "label": "minimax · minimax-m3",
    "sublabel": "vk/minimax/minimax-m3",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-5.6-luna",
    "label": "openai · gpt-5.6-luna",
    "sublabel": "vk/openai/gpt-5.6-luna",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/gemini/gemini-3.7-flash-high",
    "label": "gemini · gemini-3.7-flash-high",
    "sublabel": "vk/gemini/gemini-3.7-flash-high",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-fable-5.1",
    "label": "anthropic · claude-fable-5.1",
    "sublabel": "vk/anthropic/claude-fable-5.1",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/qwen/qwen3.6-plus-uncensored",
    "label": "qwen · qwen3.6-plus-uncensored",
    "sublabel": "vk/qwen/qwen3.6-plus-uncensored",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-6-astra",
    "label": "openai · gpt-6-astra",
    "sublabel": "vk/openai/gpt-6-astra",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/gemini/gemini-3.8-flash",
    "label": "gemini · gemini-3.8-flash",
    "sublabel": "vk/gemini/gemini-3.8-flash",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/deepseek/deepseek-v4.1-flash",
    "label": "deepseek · deepseek-v4.1-flash",
    "sublabel": "vk/deepseek/deepseek-v4.1-flash",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-6-luna",
    "label": "openai · gpt-6-luna",
    "sublabel": "vk/openai/gpt-6-luna",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-6-sol",
    "label": "openai · gpt-6-sol",
    "sublabel": "vk/openai/gpt-6-sol",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-opus-5.5",
    "label": "anthropic · claude-opus-5.5",
    "sublabel": "vk/anthropic/claude-opus-5.5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/claude-sonnet-5.5",
    "label": "anthropic · claude-sonnet-5.5",
    "sublabel": "vk/anthropic/claude-sonnet-5.5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-6.1-sol",
    "label": "openai · gpt-6.1-sol",
    "sublabel": "vk/openai/gpt-6.1-sol",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/xiaomi/mimo-v2.6-pro",
    "label": "xiaomi · mimo-v2.6-pro",
    "sublabel": "vk/xiaomi/mimo-v2.6-pro",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/anthropic/haiku-5.5",
    "label": "anthropic · haiku-5.5",
    "sublabel": "vk/anthropic/haiku-5.5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/vk/openai/gpt-5.5",
    "label": "openai · gpt-5.5",
    "sublabel": "vk/openai/gpt-5.5",
    "badge": "vk"
  },
  {
    "value": "adit-9router/qn/qonek/grok-4.5",
    "label": "qonek · grok-4.5",
    "sublabel": "qn/qonek/grok-4.5",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/muse-spark-1.2-contributor",
    "label": "qonek · muse-spark-1.2-contributor",
    "sublabel": "qn/qonek/muse-spark-1.2-contributor",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/deepseek-v4-flash-0731",
    "label": "qonek · deepseek-v4-flash-0731",
    "sublabel": "qn/qonek/deepseek-v4-flash-0731",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/deepseek-v4-flash-vision-exp",
    "label": "qonek · deepseek-v4-flash-vision-exp",
    "sublabel": "qn/qonek/deepseek-v4-flash-vision-exp",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/grok-4.6",
    "label": "qonek · grok-4.6",
    "sublabel": "qn/qonek/grok-4.6",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/hy4-preview",
    "label": "qonek · hy4-preview",
    "sublabel": "qn/qonek/hy4-preview",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/minimax-m3",
    "label": "qonek · minimax-m3",
    "sublabel": "qn/qonek/minimax-m3",
    "badge": "qn"
  },
  {
    "value": "adit-9router/qn/qonek/qwen3.8-flash",
    "label": "qonek · qwen3.8-flash",
    "sublabel": "qn/qonek/qwen3.8-flash",
    "badge": "qn"
  },
  {
    "value": "adit-9router/ocg/deepseek-flash",
    "label": "deepseek-flash",
    "sublabel": "ocg/deepseek-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/glm-5.3-flash",
    "label": "glm-5.3-flash",
    "sublabel": "ocg/glm-5.3-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/glm-5.3",
    "label": "glm-5.3",
    "sublabel": "ocg/glm-5.3",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "ocg/glm-5.2",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/glm-5.1",
    "label": "glm-5.1",
    "sublabel": "ocg/glm-5.1",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/glm-5",
    "label": "glm-5",
    "sublabel": "ocg/glm-5",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/kimi-k2.7-code",
    "label": "kimi-k2.7-code",
    "sublabel": "ocg/kimi-k2.7-code",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/kimi-k2.6",
    "label": "kimi-k2.6",
    "sublabel": "ocg/kimi-k2.6",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/kimi-k2.5",
    "label": "kimi-k2.5",
    "sublabel": "ocg/kimi-k2.5",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/kimi-k3",
    "label": "kimi-k3",
    "sublabel": "ocg/kimi-k3",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "ocg/deepseek-v4-pro",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "ocg/deepseek-v4-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/deepseek-v4-flash-vision-exp",
    "label": "deepseek-v4-flash-vision-exp",
    "sublabel": "ocg/deepseek-v4-flash-vision-exp",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/deepseek-v4.1-flash",
    "label": "deepseek-v4.1-flash",
    "sublabel": "ocg/deepseek-v4.1-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/longcat-2.0",
    "label": "longcat-2.0",
    "sublabel": "ocg/longcat-2.0",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2.6-flash",
    "label": "mimo-v2.6-flash",
    "sublabel": "ocg/mimo-v2.6-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2.6-pro",
    "label": "mimo-v2.6-pro",
    "sublabel": "ocg/mimo-v2.6-pro",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "ocg/mimo-v2.5",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "ocg/mimo-v2.5-pro",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2-pro",
    "label": "mimo-v2-pro",
    "sublabel": "ocg/mimo-v2-pro",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/mimo-v2-omni",
    "label": "mimo-v2-omni",
    "sublabel": "ocg/mimo-v2-omni",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "ocg/minimax-m3",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/minimax-m2.7",
    "label": "minimax-m2.7",
    "sublabel": "ocg/minimax-m2.7",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/minimax-m2.5",
    "label": "minimax-m2.5",
    "sublabel": "ocg/minimax-m2.5",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/space-bunny-free",
    "label": "space-bunny-free",
    "sublabel": "ocg/space-bunny-free",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.8-max",
    "label": "qwen3.8-max",
    "sublabel": "ocg/qwen3.8-max",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.8-flash",
    "label": "qwen3.8-flash",
    "sublabel": "ocg/qwen3.8-flash",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.7-max",
    "label": "qwen3.7-max",
    "sublabel": "ocg/qwen3.7-max",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.7-plus",
    "label": "qwen3.7-plus",
    "sublabel": "ocg/qwen3.7-plus",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.6-plus",
    "label": "qwen3.6-plus",
    "sublabel": "ocg/qwen3.6-plus",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/qwen3.5-plus",
    "label": "qwen3.5-plus",
    "sublabel": "ocg/qwen3.5-plus",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/hy4-preview",
    "label": "hy4-preview",
    "sublabel": "ocg/hy4-preview",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/hy3",
    "label": "hy3",
    "sublabel": "ocg/hy3",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/hy3-preview",
    "label": "hy3-preview",
    "sublabel": "ocg/hy3-preview",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/omen-alpha",
    "label": "omen-alpha",
    "sublabel": "ocg/omen-alpha",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/grok-4.7",
    "label": "grok-4.7",
    "sublabel": "ocg/grok-4.7",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/grok-4.6",
    "label": "grok-4.6",
    "sublabel": "ocg/grok-4.6",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/grok-4.5",
    "label": "grok-4.5",
    "sublabel": "ocg/grok-4.5",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "ocg/gpt-5.6-luna",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "ocg/gpt-6-luna",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/muse-spark-1.2-contributor",
    "label": "muse-spark-1.2-contributor",
    "sublabel": "ocg/muse-spark-1.2-contributor",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/ocg/muse-spark-1.3-contributor",
    "label": "muse-spark-1.3-contributor",
    "sublabel": "ocg/muse-spark-1.3-contributor",
    "badge": "ocg"
  },
  {
    "value": "adit-9router/xk/google/gemini-3.6-flash",
    "label": "google · gemini-3.6-flash",
    "sublabel": "xk/google/gemini-3.6-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-6.1-sol",
    "label": "openai · gpt-6.1-sol",
    "sublabel": "xk/openai/gpt-6.1-sol",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/x-ai/grok-4.5",
    "label": "x-ai · grok-4.5",
    "sublabel": "xk/x-ai/grok-4.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/ministral-14b",
    "label": "mistralai · ministral-14b",
    "sublabel": "xk/mistralai/ministral-14b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5.3",
    "label": "z-ai · glm-5.3",
    "sublabel": "xk/z-ai/glm-5.3",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-4.8",
    "label": "anthropic · claude-opus-4.8",
    "sublabel": "xk/anthropic/claude-opus-4.8",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5",
    "label": "z-ai · glm-5",
    "sublabel": "xk/z-ai/glm-5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/x-ai/grok-4.7",
    "label": "x-ai · grok-4.7",
    "sublabel": "xk/x-ai/grok-4.7",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5-air",
    "label": "z-ai · glm-4.5-air",
    "sublabel": "xk/z-ai/glm-4.5-air",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.7-flash",
    "label": "z-ai · glm-4.7-flash",
    "sublabel": "xk/z-ai/glm-4.7-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5-airx",
    "label": "z-ai · glm-4.5-airx",
    "sublabel": "xk/z-ai/glm-4.5-airx",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.6v-flash",
    "label": "z-ai · glm-4.6v-flash",
    "sublabel": "xk/z-ai/glm-4.6v-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-5",
    "label": "anthropic · claude-opus-5",
    "sublabel": "xk/anthropic/claude-opus-5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5v",
    "label": "z-ai · glm-4.5v",
    "sublabel": "xk/z-ai/glm-4.5v",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m3",
    "label": "minimax · minimax-m3",
    "sublabel": "xk/minimax/minimax-m3",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.7",
    "label": "minimax · minimax-m2.7",
    "sublabel": "xk/minimax/minimax-m2.7",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.7-highspeed",
    "label": "minimax · minimax-m2.7-highspeed",
    "sublabel": "xk/minimax/minimax-m2.7-highspeed",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4-pro-0813",
    "label": "deepseek · deepseek-v4-pro-0813",
    "sublabel": "xk/deepseek/deepseek-v4-pro-0813",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-6-astra",
    "label": "openai · gpt-6-astra",
    "sublabel": "xk/openai/gpt-6-astra",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-6-sol",
    "label": "openai · gpt-6-sol",
    "sublabel": "xk/openai/gpt-6-sol",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-4.5",
    "label": "anthropic · claude-opus-4.5",
    "sublabel": "xk/anthropic/claude-opus-4.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-sonnet-4.6",
    "label": "anthropic · claude-sonnet-4.6",
    "sublabel": "xk/anthropic/claude-sonnet-4.6",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4.1-flash",
    "label": "deepseek · deepseek-v4.1-flash",
    "sublabel": "xk/deepseek/deepseek-v4.1-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/tencent/hy4-preview",
    "label": "tencent · hy4-preview",
    "sublabel": "xk/tencent/hy4-preview",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-haiku-4.5",
    "label": "anthropic · claude-haiku-4.5",
    "sublabel": "xk/anthropic/claude-haiku-4.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/tencent/hy3-preview",
    "label": "tencent · hy3-preview",
    "sublabel": "xk/tencent/hy3-preview",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-3.8-flash",
    "label": "google · gemini-3.8-flash",
    "sublabel": "xk/google/gemini-3.8-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k2.8-preview-agent",
    "label": "moonshotai · kimi-k2.8-preview-agent",
    "sublabel": "xk/moonshotai/kimi-k2.8-preview-agent",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/nvidia/nemotron-3-super",
    "label": "nvidia · nemotron-3-super",
    "sublabel": "xk/nvidia/nemotron-3-super",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen-plus-2025-07-28:free",
    "label": "qwen · qwen-plus-2025-07-28:free",
    "sublabel": "xk/qwen/qwen-plus-2025-07-28:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3-vl-plus:free",
    "label": "qwen · qwen3-vl-plus:free",
    "sublabel": "xk/qwen/qwen3-vl-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-3.7-flash",
    "label": "google · gemini-3.7-flash",
    "sublabel": "xk/google/gemini-3.7-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/x-ai/grok-4.6",
    "label": "x-ai · grok-4.6",
    "sublabel": "xk/x-ai/grok-4.6",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/sensenova/sensenova-6.8-flash-lite",
    "label": "sensenova · sensenova-6.8-flash-lite",
    "sublabel": "xk/sensenova/sensenova-6.8-flash-lite",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/north-mini-code",
    "label": "cohere · north-mini-code",
    "sublabel": "xk/cohere/north-mini-code",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-a",
    "label": "cohere · command-a",
    "sublabel": "xk/cohere/command-a",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-r-08-2024",
    "label": "cohere · command-r-08-2024",
    "sublabel": "xk/cohere/command-r-08-2024",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/aya-vision-32b",
    "label": "cohere · aya-vision-32b",
    "sublabel": "xk/cohere/aya-vision-32b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/tiny-aya-global",
    "label": "cohere · tiny-aya-global",
    "sublabel": "xk/cohere/tiny-aya-global",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-r-plus-08-2024",
    "label": "cohere · command-r-plus-08-2024",
    "sublabel": "xk/cohere/command-r-plus-08-2024",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/aya-expanse-32b",
    "label": "cohere · aya-expanse-32b",
    "sublabel": "xk/cohere/aya-expanse-32b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/ministral-3b",
    "label": "mistralai · ministral-3b",
    "sublabel": "xk/mistralai/ministral-3b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-sonnet-4",
    "label": "anthropic · claude-sonnet-4",
    "sublabel": "xk/anthropic/claude-sonnet-4",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.6v",
    "label": "z-ai · glm-4.6v",
    "sublabel": "xk/z-ai/glm-4.6v",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/tiny-aya-earth",
    "label": "cohere · tiny-aya-earth",
    "sublabel": "xk/cohere/tiny-aya-earth",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/tiny-aya-fire",
    "label": "cohere · tiny-aya-fire",
    "sublabel": "xk/cohere/tiny-aya-fire",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.6-terra",
    "label": "openai · gpt-5.6-terra",
    "sublabel": "xk/openai/gpt-5.6-terra",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/mistral-large-4-0",
    "label": "mistralai · mistral-large-4-0",
    "sublabel": "xk/mistralai/mistral-large-4-0",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-a-plus",
    "label": "cohere · command-a-plus",
    "sublabel": "xk/cohere/command-a-plus",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/xiaomi/mimo-v2.5-pro",
    "label": "xiaomi · mimo-v2.5-pro",
    "sublabel": "xk/xiaomi/mimo-v2.5-pro",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.6-luna",
    "label": "openai · gpt-5.6-luna",
    "sublabel": "xk/openai/gpt-5.6-luna",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.4-mini",
    "label": "openai · gpt-5.4-mini",
    "sublabel": "xk/openai/gpt-5.4-mini",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-4.6",
    "label": "anthropic · claude-opus-4.6",
    "sublabel": "xk/anthropic/claude-opus-4.6",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/inclusionai/ling-3.0-flash-sante:free",
    "label": "inclusionai · ling-3.0-flash-sante:free",
    "sublabel": "xk/inclusionai/ling-3.0-flash-sante:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-6-luna",
    "label": "openai · gpt-6-luna",
    "sublabel": "xk/openai/gpt-6-luna",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-3.5-flash",
    "label": "google · gemini-3.5-flash",
    "sublabel": "xk/google/gemini-3.5-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-sonnet-4.5",
    "label": "anthropic · claude-sonnet-4.5",
    "sublabel": "xk/anthropic/claude-sonnet-4.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-fable-5-1",
    "label": "anthropic · claude-fable-5-1",
    "sublabel": "xk/anthropic/claude-fable-5-1",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-fable-5",
    "label": "anthropic · claude-fable-5",
    "sublabel": "xk/anthropic/claude-fable-5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-sonnet-5",
    "label": "anthropic · claude-sonnet-5",
    "sublabel": "xk/anthropic/claude-sonnet-5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-2.5-flash",
    "label": "google · gemini-2.5-flash",
    "sublabel": "xk/google/gemini-2.5-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-3.1-pro",
    "label": "google · gemini-3.1-pro",
    "sublabel": "xk/google/gemini-3.1-pro",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k3-agent",
    "label": "moonshotai · kimi-k3-agent",
    "sublabel": "xk/moonshotai/kimi-k3-agent",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/mistral-large-2512",
    "label": "mistralai · mistral-large-2512",
    "sublabel": "xk/mistralai/mistral-large-2512",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/mistral-medium-3.5",
    "label": "mistralai · mistral-medium-3.5",
    "sublabel": "xk/mistralai/mistral-medium-3.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.5",
    "label": "openai · gpt-5.5",
    "sublabel": "xk/openai/gpt-5.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/mistral-small-2603",
    "label": "mistralai · mistral-small-2603",
    "sublabel": "xk/mistralai/mistral-small-2603",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.4",
    "label": "openai · gpt-5.4",
    "sublabel": "xk/openai/gpt-5.4",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5.3-flash",
    "label": "z-ai · glm-5.3-flash",
    "sublabel": "xk/z-ai/glm-5.3-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5.1",
    "label": "z-ai · glm-5.1",
    "sublabel": "xk/z-ai/glm-5.1",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/devstral-medium",
    "label": "mistralai · devstral-medium",
    "sublabel": "xk/mistralai/devstral-medium",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-5.5",
    "label": "anthropic · claude-opus-5.5",
    "sublabel": "xk/anthropic/claude-opus-5.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/codestral-2508",
    "label": "mistralai · codestral-2508",
    "sublabel": "xk/mistralai/codestral-2508",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-a-translate",
    "label": "cohere · command-a-translate",
    "sublabel": "xk/cohere/command-a-translate",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5-flash",
    "label": "z-ai · glm-4.5-flash",
    "sublabel": "xk/z-ai/glm-4.5-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5.2",
    "label": "z-ai · glm-5.2",
    "sublabel": "xk/z-ai/glm-5.2",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5-turbo",
    "label": "z-ai · glm-5-turbo",
    "sublabel": "xk/z-ai/glm-5-turbo",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-3-flash",
    "label": "google · gemini-3-flash",
    "sublabel": "xk/google/gemini-3-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.7",
    "label": "z-ai · glm-4.7",
    "sublabel": "xk/z-ai/glm-4.7",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.5",
    "label": "minimax · minimax-m2.5",
    "sublabel": "xk/minimax/minimax-m2.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.1",
    "label": "minimax · minimax-m2.1",
    "sublabel": "xk/minimax/minimax-m2.1",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/mistralai/ministral-8b",
    "label": "mistralai · ministral-8b",
    "sublabel": "xk/mistralai/ministral-8b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.7-flashx",
    "label": "z-ai · glm-4.7-flashx",
    "sublabel": "xk/z-ai/glm-4.7-flashx",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3-omni-flash:free",
    "label": "qwen · qwen3-omni-flash:free",
    "sublabel": "xk/qwen/qwen3-omni-flash:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-5v-turbo",
    "label": "z-ai · glm-5v-turbo",
    "sublabel": "xk/z-ai/glm-5v-turbo",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.6v-flashx",
    "label": "z-ai · glm-4.6v-flashx",
    "sublabel": "xk/z-ai/glm-4.6v-flashx",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/google/gemini-2.5-pro",
    "label": "google · gemini-2.5-pro",
    "sublabel": "xk/google/gemini-2.5-pro",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/xiaomi/mimo-v2.6-pro",
    "label": "xiaomi · mimo-v2.6-pro",
    "sublabel": "xk/xiaomi/mimo-v2.6-pro",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4-flash-0731",
    "label": "deepseek · deepseek-v4-flash-0731",
    "sublabel": "xk/deepseek/deepseek-v4-flash-0731",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/xiaomi/mimo-v2.6-flash",
    "label": "xiaomi · mimo-v2.6-flash",
    "sublabel": "xk/xiaomi/mimo-v2.6-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/anthropic/claude-opus-4.7",
    "label": "anthropic · claude-opus-4.7",
    "sublabel": "xk/anthropic/claude-opus-4.7",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.5-highspeed",
    "label": "minimax · minimax-m2.5-highspeed",
    "sublabel": "xk/minimax/minimax-m2.5-highspeed",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.1-highspeed",
    "label": "minimax · minimax-m2.1-highspeed",
    "sublabel": "xk/minimax/minimax-m2.1-highspeed",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2",
    "label": "minimax · minimax-m2",
    "sublabel": "xk/minimax/minimax-m2",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/xiaomi/mimo-v2.5",
    "label": "xiaomi · mimo-v2.5",
    "sublabel": "xk/xiaomi/mimo-v2.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/tencent/hy3",
    "label": "tencent · hy3",
    "sublabel": "xk/tencent/hy3",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/meta/muse-spark-1.3-contributor:free",
    "label": "meta · muse-spark-1.3-contributor:free",
    "sublabel": "xk/meta/muse-spark-1.3-contributor:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.6-plus:free",
    "label": "qwen · qwen3.6-plus:free",
    "sublabel": "xk/qwen/qwen3.6-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/meta/muse-spark-1.2-contributor:free",
    "label": "meta · muse-spark-1.2-contributor:free",
    "sublabel": "xk/meta/muse-spark-1.2-contributor:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.7-max:free",
    "label": "qwen · qwen3.7-max:free",
    "sublabel": "xk/qwen/qwen3.7-max:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/meituan/longcat-2.0",
    "label": "meituan · longcat-2.0",
    "sublabel": "xk/meituan/longcat-2.0",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/meituan/longcat-2.5-preview:free",
    "label": "meituan · longcat-2.5-preview:free",
    "sublabel": "xk/meituan/longcat-2.5-preview:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/stealth/space-bunny-alpha:free",
    "label": "stealth · space-bunny-alpha:free",
    "sublabel": "xk/stealth/space-bunny-alpha:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.6-sol",
    "label": "openai · gpt-5.6-sol",
    "sublabel": "xk/openai/gpt-5.6-sol",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.7-plus:free",
    "label": "qwen · qwen3.7-plus:free",
    "sublabel": "xk/qwen/qwen3.7-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/nvidia/nemotron-3-ultra",
    "label": "nvidia · nemotron-3-ultra",
    "sublabel": "xk/nvidia/nemotron-3-ultra",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/stealth/big-pickle",
    "label": "stealth · big-pickle",
    "sublabel": "xk/stealth/big-pickle",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-omni-flash:free",
    "label": "qwen · qwen3.5-omni-flash:free",
    "sublabel": "xk/qwen/qwen3.5-omni-flash:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-r7b-12-2024",
    "label": "cohere · command-r7b-12-2024",
    "sublabel": "xk/cohere/command-r7b-12-2024",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/nvidia/nemotron-3-nano-omni",
    "label": "nvidia · nemotron-3-nano-omni",
    "sublabel": "xk/nvidia/nemotron-3-nano-omni",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/liquid/lfm-2.5-2.6b:free",
    "label": "liquid · lfm-2.5-2.6b:free",
    "sublabel": "xk/liquid/lfm-2.5-2.6b:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/apodex/apodex-1.1-mini:free",
    "label": "apodex · apodex-1.1-mini:free",
    "sublabel": "xk/apodex/apodex-1.1-mini:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/dots-studio/dots-3-note-preview:free",
    "label": "dots-studio · dots-3-note-preview:free",
    "sublabel": "xk/dots-studio/dots-3-note-preview:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.8-max:free",
    "label": "qwen · qwen3.8-max:free",
    "sublabel": "xk/qwen/qwen3.8-max:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.8-omni-flash:free",
    "label": "qwen · qwen3.8-omni-flash:free",
    "sublabel": "xk/qwen/qwen3.8-omni-flash:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.7-flash:free",
    "label": "qwen · qwen3.7-flash:free",
    "sublabel": "xk/qwen/qwen3.7-flash:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.6-max-preview:free",
    "label": "qwen · qwen3.6-max-preview:free",
    "sublabel": "xk/qwen/qwen3.6-max-preview:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3-coder-plus:free",
    "label": "qwen · qwen3-coder-plus:free",
    "sublabel": "xk/qwen/qwen3-coder-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/north-small-translate",
    "label": "cohere · north-small-translate",
    "sublabel": "xk/cohere/north-small-translate",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.6-27b:free",
    "label": "qwen · qwen3.6-27b:free",
    "sublabel": "xk/qwen/qwen3.6-27b:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-plus:free",
    "label": "qwen · qwen3.5-plus:free",
    "sublabel": "xk/qwen/qwen3.5-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-a-vision",
    "label": "cohere · command-a-vision",
    "sublabel": "xk/cohere/command-a-vision",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/command-a-reasoning",
    "label": "cohere · command-a-reasoning",
    "sublabel": "xk/cohere/command-a-reasoning",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-omni-plus:free",
    "label": "qwen · qwen3.5-omni-plus:free",
    "sublabel": "xk/qwen/qwen3.5-omni-plus:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.6-35b-a3b:free",
    "label": "qwen · qwen3.6-35b-a3b:free",
    "sublabel": "xk/qwen/qwen3.6-35b-a3b:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-flash:free",
    "label": "qwen · qwen3.5-flash:free",
    "sublabel": "xk/qwen/qwen3.5-flash:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/cohere/tiny-aya-water",
    "label": "cohere · tiny-aya-water",
    "sublabel": "xk/cohere/tiny-aya-water",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-397b-a17b:free",
    "label": "qwen · qwen3.5-397b-a17b:free",
    "sublabel": "xk/qwen/qwen3.5-397b-a17b:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3-max:free",
    "label": "qwen · qwen3-max:free",
    "sublabel": "xk/qwen/qwen3-max:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/openai/gpt-5.3-codex-spark",
    "label": "openai · gpt-5.3-codex-spark",
    "sublabel": "xk/openai/gpt-5.3-codex-spark",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m3:free",
    "label": "minimax · minimax-m3:free",
    "sublabel": "xk/minimax/minimax-m3:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.7:free",
    "label": "minimax · minimax-m2.7:free",
    "sublabel": "xk/minimax/minimax-m2.7:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.7-max",
    "label": "qwen · qwen3.7-max",
    "sublabel": "xk/qwen/qwen3.7-max",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/x-ai/grok-build-0.1",
    "label": "x-ai · grok-build-0.1",
    "sublabel": "xk/x-ai/grok-build-0.1",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k3",
    "label": "moonshotai · kimi-k3",
    "sublabel": "xk/moonshotai/kimi-k3",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k2.6",
    "label": "moonshotai · kimi-k2.6",
    "sublabel": "xk/moonshotai/kimi-k2.6",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k2.7-code",
    "label": "moonshotai · kimi-k2.7-code",
    "sublabel": "xk/moonshotai/kimi-k2.7-code",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/moonshotai/kimi-k2.5",
    "label": "moonshotai · kimi-k2.5",
    "sublabel": "xk/moonshotai/kimi-k2.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5",
    "label": "z-ai · glm-4.5",
    "sublabel": "xk/z-ai/glm-4.5",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-chat-v3.1",
    "label": "deepseek · deepseek-chat-v3.1",
    "sublabel": "xk/deepseek/deepseek-chat-v3.1",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.7-highspeed:free",
    "label": "minimax · minimax-m2.7-highspeed:free",
    "sublabel": "xk/minimax/minimax-m2.7-highspeed:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.5:free",
    "label": "minimax · minimax-m2.5:free",
    "sublabel": "xk/minimax/minimax-m2.5:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.5-highspeed:free",
    "label": "minimax · minimax-m2.5-highspeed:free",
    "sublabel": "xk/minimax/minimax-m2.5-highspeed:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.5-x",
    "label": "z-ai · glm-4.5-x",
    "sublabel": "xk/z-ai/glm-4.5-x",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.1:free",
    "label": "minimax · minimax-m2.1:free",
    "sublabel": "xk/minimax/minimax-m2.1:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2.1-highspeed:free",
    "label": "minimax · minimax-m2.1-highspeed:free",
    "sublabel": "xk/minimax/minimax-m2.1-highspeed:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/minimax/minimax-m2:free",
    "label": "minimax · minimax-m2:free",
    "sublabel": "xk/minimax/minimax-m2:free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/z-ai/glm-4.6",
    "label": "z-ai · glm-4.6",
    "sublabel": "xk/z-ai/glm-4.6",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4-flash-vision-exp",
    "label": "deepseek · deepseek-v4-flash-vision-exp",
    "sublabel": "xk/deepseek/deepseek-v4-flash-vision-exp",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4-pro",
    "label": "deepseek · deepseek-v4-pro",
    "sublabel": "xk/deepseek/deepseek-v4-pro",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v3.2",
    "label": "deepseek · deepseek-v3.2",
    "sublabel": "xk/deepseek/deepseek-v3.2",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/meta/muse-spark-1.2-contributor",
    "label": "meta · muse-spark-1.2-contributor",
    "sublabel": "xk/meta/muse-spark-1.2-contributor",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/deepseek/deepseek-v4-flash",
    "label": "deepseek · deepseek-v4-flash",
    "sublabel": "xk/deepseek/deepseek-v4-flash",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.7-plus",
    "label": "qwen · qwen3.7-plus",
    "sublabel": "xk/qwen/qwen3.7-plus",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/sensenova/sensenova-6.7-flash-lite",
    "label": "sensenova · sensenova-6.7-flash-lite",
    "sublabel": "xk/sensenova/sensenova-6.7-flash-lite",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.8-max",
    "label": "qwen · qwen3.8-max",
    "sublabel": "xk/qwen/qwen3.8-max",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.6-plus",
    "label": "qwen · qwen3.6-plus",
    "sublabel": "xk/qwen/qwen3.6-plus",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/qwen/qwen3.5-plus",
    "label": "qwen · qwen3.5-plus",
    "sublabel": "xk/qwen/qwen3.5-plus",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/nvidia/llama-3.3-nemotron-super-49b",
    "label": "nvidia · llama-3.3-nemotron-super-49b",
    "sublabel": "xk/nvidia/llama-3.3-nemotron-super-49b",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/nvidia/nemotron-3-nano",
    "label": "nvidia · nemotron-3-nano",
    "sublabel": "xk/nvidia/nemotron-3-nano",
    "badge": "xk"
  },
  {
    "value": "adit-9router/xk/free",
    "label": "free",
    "sublabel": "xk/free",
    "badge": "xk"
  },
  {
    "value": "adit-9router/bn/agnes-2.0-flash",
    "label": "agnes-2.0-flash",
    "sublabel": "bn/agnes-2.0-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/agnes-2.5-flash",
    "label": "agnes-2.5-flash",
    "sublabel": "bn/agnes-2.5-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/agnes-video-v2.0",
    "label": "agnes-video-v2.0",
    "sublabel": "bn/agnes-video-v2.0",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-fable-5",
    "label": "claude-fable-5",
    "sublabel": "bn/claude-fable-5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-fable-5.1",
    "label": "claude-fable-5.1",
    "sublabel": "bn/claude-fable-5.1",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-opus-4.7",
    "label": "claude-opus-4.7",
    "sublabel": "bn/claude-opus-4.7",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-opus-4.8",
    "label": "claude-opus-4.8",
    "sublabel": "bn/claude-opus-4.8",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-opus-5",
    "label": "claude-opus-5",
    "sublabel": "bn/claude-opus-5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/claude-sonnet-5",
    "label": "claude-sonnet-5",
    "sublabel": "bn/claude-sonnet-5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-flash-alibaba",
    "label": "deepseek-v4-flash-alibaba",
    "sublabel": "bn/deepseek-v4-flash-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-flash-free",
    "label": "deepseek-v4-flash-free",
    "sublabel": "bn/deepseek-v4-flash-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-flash-vision-exp",
    "label": "deepseek-v4-flash-vision-exp",
    "sublabel": "bn/deepseek-v4-flash-vision-exp",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-pro-0813-bynara",
    "label": "deepseek-v4-pro-0813-bynara",
    "sublabel": "bn/deepseek-v4-pro-0813-bynara",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-pro-alibaba",
    "label": "deepseek-v4-pro-alibaba",
    "sublabel": "bn/deepseek-v4-pro-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "bn/glm-5.2",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.2-alibaba",
    "label": "glm-5.2-alibaba",
    "sublabel": "bn/glm-5.2-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.2-promo",
    "label": "glm-5.2-promo",
    "sublabel": "bn/glm-5.2-promo",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.3",
    "label": "glm-5.3",
    "sublabel": "bn/glm-5.3",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.3-flash",
    "label": "glm-5.3-flash",
    "sublabel": "bn/glm-5.3-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.3-flash-free",
    "label": "glm-5.3-flash-free",
    "sublabel": "bn/glm-5.3-flash-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/glm-5.3-free",
    "label": "glm-5.3-free",
    "sublabel": "bn/glm-5.3-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/gpt-5.4",
    "label": "gpt-5.4",
    "sublabel": "bn/gpt-5.4",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "bn/gpt-5.5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "bn/gpt-5.6-luna",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "bn/gpt-5.6-sol",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "bn/gpt-5.6-terra",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/grok-4.6",
    "label": "grok-4.6",
    "sublabel": "bn/grok-4.6",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/kimi-k2.7-code",
    "label": "kimi-k2.7-code",
    "sublabel": "bn/kimi-k2.7-code",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/kimi-k2.7-code-alibaba",
    "label": "kimi-k2.7-code-alibaba",
    "sublabel": "bn/kimi-k2.7-code-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/kimi-k3",
    "label": "kimi-k3",
    "sublabel": "bn/kimi-k3",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/laguna-s-2.1",
    "label": "laguna-s-2.1",
    "sublabel": "bn/laguna-s-2.1",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "bn/mimo-v2.5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mimo-v2.5-free",
    "label": "mimo-v2.5-free",
    "sublabel": "bn/mimo-v2.5-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mimo-v2.5-pro-ultraspeed",
    "label": "mimo-v2.5-pro-ultraspeed",
    "sublabel": "bn/mimo-v2.5-pro-ultraspeed",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "bn/minimax-m3",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/minimax-m3-free",
    "label": "minimax-m3-free",
    "sublabel": "bn/minimax-m3-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mistral-large",
    "label": "mistral-large",
    "sublabel": "bn/mistral-large",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mistral-medium-3-5",
    "label": "mistral-medium-3-5",
    "sublabel": "bn/mistral-medium-3-5",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.2",
    "label": "muse-spark-1.2",
    "sublabel": "bn/muse-spark-1.2",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.2-contributor",
    "label": "muse-spark-1.2-contributor",
    "sublabel": "bn/muse-spark-1.2-contributor",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.2-contributor-free",
    "label": "muse-spark-1.2-contributor-free",
    "sublabel": "bn/muse-spark-1.2-contributor-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.3",
    "label": "muse-spark-1.3",
    "sublabel": "bn/muse-spark-1.3",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.3-contributor",
    "label": "muse-spark-1.3-contributor",
    "sublabel": "bn/muse-spark-1.3-contributor",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/muse-spark-1.3-contributor-free",
    "label": "muse-spark-1.3-contributor-free",
    "sublabel": "bn/muse-spark-1.3-contributor-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-flash",
    "label": "qwen3.7-flash",
    "sublabel": "bn/qwen3.7-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-flash-alibaba",
    "label": "qwen3.7-flash-alibaba",
    "sublabel": "bn/qwen3.7-flash-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-max-alibaba",
    "label": "qwen3.7-max-alibaba",
    "sublabel": "bn/qwen3.7-max-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-plus",
    "label": "qwen3.7-plus",
    "sublabel": "bn/qwen3.7-plus",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-plus-alibaba",
    "label": "qwen3.7-plus-alibaba",
    "sublabel": "bn/qwen3.7-plus-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.8-27b",
    "label": "qwen3.8-27b",
    "sublabel": "bn/qwen3.8-27b",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.8-flash",
    "label": "qwen3.8-flash",
    "sublabel": "bn/qwen3.8-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.8-flash-free",
    "label": "qwen3.8-flash-free",
    "sublabel": "bn/qwen3.8-flash-free",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.8-max",
    "label": "qwen3.8-max",
    "sublabel": "bn/qwen3.8-max",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.8-max-alibaba",
    "label": "qwen3.8-max-alibaba",
    "sublabel": "bn/qwen3.8-max-alibaba",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/stepfun-3.7-flash",
    "label": "stepfun-3.7-flash",
    "sublabel": "bn/stepfun-3.7-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "bn/deepseek-v4-flash",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "bn/deepseek-v4-pro",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/qwen3.7-max",
    "label": "qwen3.7-max",
    "sublabel": "bn/qwen3.7-max",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bn/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "bn/mimo-v2.5-pro",
    "badge": "bn"
  },
  {
    "value": "adit-9router/bi/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "bi/minimax-m3",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/minimax-m2.7",
    "label": "minimax-m2.7",
    "sublabel": "bi/minimax-m2.7",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm-5.1",
    "label": "glm-5.1",
    "sublabel": "bi/glm-5.1",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "bi/glm-5.2",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-6.1-sol",
    "label": "gpt-6.1-sol",
    "sublabel": "bi/gpt-6.1-sol",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-6-astra",
    "label": "gpt-6-astra",
    "sublabel": "bi/gpt-6-astra",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-6-sol",
    "label": "gpt-6-sol",
    "sublabel": "bi/gpt-6-sol",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "bi/gpt-6-luna",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "bi/gpt-5.6-sol",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "bi/gpt-5.6-terra",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "bi/gpt-5.6-luna",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "bi/gpt-5.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.5-instant",
    "label": "gpt-5.5-instant",
    "sublabel": "bi/gpt-5.5-instant",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.4",
    "label": "gpt-5.4",
    "sublabel": "bi/gpt-5.4",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.2",
    "label": "gpt-5.2",
    "sublabel": "bi/gpt-5.2",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.4-pro",
    "label": "gpt-5.4-pro",
    "sublabel": "bi/gpt-5.4-pro",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.4-mini",
    "label": "gpt-5.4-mini",
    "sublabel": "bi/gpt-5.4-mini",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5-mini",
    "label": "gpt-5-mini",
    "sublabel": "bi/gpt-5-mini",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5.4-nano",
    "label": "gpt-5.4-nano",
    "sublabel": "bi/gpt-5.4-nano",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gpt-5-nano",
    "label": "gpt-5-nano",
    "sublabel": "bi/gpt-5-nano",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-5.5",
    "label": "claude-opus-5.5",
    "sublabel": "bi/claude-opus-5.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-sonnet-5.5",
    "label": "claude-sonnet-5.5",
    "sublabel": "bi/claude-sonnet-5.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-haiku-5.5",
    "label": "claude-haiku-5.5",
    "sublabel": "bi/claude-haiku-5.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-fable-5.1",
    "label": "claude-fable-5.1",
    "sublabel": "bi/claude-fable-5.1",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-fable-5",
    "label": "claude-fable-5",
    "sublabel": "bi/claude-fable-5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-5",
    "label": "claude-opus-5",
    "sublabel": "bi/claude-opus-5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-4.8",
    "label": "claude-opus-4.8",
    "sublabel": "bi/claude-opus-4.8",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-4.7",
    "label": "claude-opus-4.7",
    "sublabel": "bi/claude-opus-4.7",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-4.6",
    "label": "claude-opus-4.6",
    "sublabel": "bi/claude-opus-4.6",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-opus-4.5",
    "label": "claude-opus-4.5",
    "sublabel": "bi/claude-opus-4.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-sonnet-5",
    "label": "claude-sonnet-5",
    "sublabel": "bi/claude-sonnet-5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-sonnet-4.6",
    "label": "claude-sonnet-4.6",
    "sublabel": "bi/claude-sonnet-4.6",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-sonnet-4.5",
    "label": "claude-sonnet-4.5",
    "sublabel": "bi/claude-sonnet-4.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/claude-haiku-4.5",
    "label": "claude-haiku-4.5",
    "sublabel": "bi/claude-haiku-4.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3.8-flash",
    "label": "gemini-3.8-flash",
    "sublabel": "bi/gemini-3.8-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3.6-flash",
    "label": "gemini-3.6-flash",
    "sublabel": "bi/gemini-3.6-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3.5-flash-lite",
    "label": "gemini-3.5-flash-lite",
    "sublabel": "bi/gemini-3.5-flash-lite",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3.5-flash",
    "label": "gemini-3.5-flash",
    "sublabel": "bi/gemini-3.5-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3.1-pro",
    "label": "gemini-3.1-pro",
    "sublabel": "bi/gemini-3.1-pro",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/gemini-3-flash",
    "label": "gemini-3-flash",
    "sublabel": "bi/gemini-3-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/hy4-preview",
    "label": "hy4-preview",
    "sublabel": "bi/hy4-preview",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/mimo-v2.6-pro",
    "label": "mimo-v2.6-pro",
    "sublabel": "bi/mimo-v2.6-pro",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm-5.3-flash",
    "label": "glm-5.3-flash",
    "sublabel": "bi/glm-5.3-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm-5.3-flashx",
    "label": "glm-5.3-flashx",
    "sublabel": "bi/glm-5.3-flashx",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/kimi-k3",
    "label": "kimi-k3",
    "sublabel": "bi/kimi-k3",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm-5.3",
    "label": "glm-5.3",
    "sublabel": "bi/glm-5.3",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/mimo-v2.6-flash",
    "label": "mimo-v2.6-flash",
    "sublabel": "bi/mimo-v2.6-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "bi/mimo-v2.5-pro",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "bi/mimo-v2.5",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/kimi-k2.8-preview",
    "label": "kimi-k2.8-preview",
    "sublabel": "bi/kimi-k2.8-preview",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/kimi-k2.6",
    "label": "kimi-k2.6",
    "sublabel": "bi/kimi-k2.6",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/hy3",
    "label": "hy3",
    "sublabel": "bi/hy3",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/qwen3.8-flash",
    "label": "qwen3.8-flash",
    "sublabel": "bi/qwen3.8-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/qwen3.8-max",
    "label": "qwen3.8-max",
    "sublabel": "bi/qwen3.8-max",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/qwen3.8-27b",
    "label": "qwen3.8-27b",
    "sublabel": "bi/qwen3.8-27b",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/jev-1.13.0",
    "label": "jev-1.13.0",
    "sublabel": "bi/jev-1.13.0",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/deepseek-v4.1-flash",
    "label": "deepseek-v4.1-flash",
    "sublabel": "bi/deepseek-v4.1-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "bi/deepseek-v4-pro",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/jev-latest",
    "label": "jev-latest",
    "sublabel": "bi/jev-latest",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "bi/deepseek-v4-flash",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/deepseek-v4-flash-vision-exp",
    "label": "deepseek-v4-flash-vision-exp",
    "sublabel": "bi/deepseek-v4-flash-vision-exp",
    "badge": "bi"
  },
  {
    "value": "adit-9router/bi/glm",
    "label": "glm",
    "sublabel": "bi/glm",
    "badge": "bi"
  },
  {
    "value": "adit-9router/ee/aion-2.0",
    "label": "aion-2.0",
    "sublabel": "ee/aion-2.0",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/aion-3.0",
    "label": "aion-3.0",
    "sublabel": "ee/aion-3.0",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/aion-3.0-mini",
    "label": "aion-3.0-mini",
    "sublabel": "ee/aion-3.0-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/aion-rp-llama-3.1-8b",
    "label": "aion-rp-llama-3.1-8b",
    "sublabel": "ee/aion-rp-llama-3.1-8b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-fable-5",
    "label": "claude-fable-5",
    "sublabel": "ee/claude-fable-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-fable-5.1",
    "label": "claude-fable-5.1",
    "sublabel": "ee/claude-fable-5.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-fable-latest",
    "label": "claude-fable-latest",
    "sublabel": "ee/claude-fable-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-haiku-4.5",
    "label": "claude-haiku-4.5",
    "sublabel": "ee/claude-haiku-4.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-haiku-5.5",
    "label": "claude-haiku-5.5",
    "sublabel": "ee/claude-haiku-5.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-haiku-latest",
    "label": "claude-haiku-latest",
    "sublabel": "ee/claude-haiku-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4.5",
    "label": "claude-opus-4.5",
    "sublabel": "ee/claude-opus-4.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4.6",
    "label": "claude-opus-4.6",
    "sublabel": "ee/claude-opus-4.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4.7",
    "label": "claude-opus-4.7",
    "sublabel": "ee/claude-opus-4.7",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4.8",
    "label": "claude-opus-4.8",
    "sublabel": "ee/claude-opus-4.8",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-5",
    "label": "claude-opus-5",
    "sublabel": "ee/claude-opus-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-5.5",
    "label": "claude-opus-5.5",
    "sublabel": "ee/claude-opus-5.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-latest",
    "label": "claude-opus-latest",
    "sublabel": "ee/claude-opus-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-4",
    "label": "claude-sonnet-4",
    "sublabel": "ee/claude-sonnet-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-4.5",
    "label": "claude-sonnet-4.5",
    "sublabel": "ee/claude-sonnet-4.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-4.6",
    "label": "claude-sonnet-4.6",
    "sublabel": "ee/claude-sonnet-4.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-5",
    "label": "claude-sonnet-5",
    "sublabel": "ee/claude-sonnet-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-5.5",
    "label": "claude-sonnet-5.5",
    "sublabel": "ee/claude-sonnet-5.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-sonnet-latest",
    "label": "claude-sonnet-latest",
    "sublabel": "ee/claude-sonnet-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/clef",
    "label": "clef",
    "sublabel": "ee/clef",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/clef-flash",
    "label": "clef-flash",
    "sublabel": "ee/clef-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/codestral-2508",
    "label": "codestral-2508",
    "sublabel": "ee/codestral-2508",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/command-a",
    "label": "command-a",
    "sublabel": "ee/command-a",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/command-r-08-2024",
    "label": "command-r-08-2024",
    "sublabel": "ee/command-r-08-2024",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/command-r-plus-08-2024",
    "label": "command-r-plus-08-2024",
    "sublabel": "ee/command-r-plus-08-2024",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/command-r7b-12-2024",
    "label": "command-r7b-12-2024",
    "sublabel": "ee/command-r7b-12-2024",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/cydonia-24b-v4.1",
    "label": "cydonia-24b-v4.1",
    "sublabel": "ee/cydonia-24b-v4.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-r1",
    "label": "deepseek-r1",
    "sublabel": "ee/deepseek-r1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-r1-0528",
    "label": "deepseek-r1-0528",
    "sublabel": "ee/deepseek-r1-0528",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v3.2",
    "label": "deepseek-v3.2",
    "sublabel": "ee/deepseek-v3.2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v3.2-exp",
    "label": "deepseek-v3.2-exp",
    "sublabel": "ee/deepseek-v3.2-exp",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v3.2-speciale",
    "label": "deepseek-v3.2-speciale",
    "sublabel": "ee/deepseek-v3.2-speciale",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "ee/deepseek-v4-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-flash-0731",
    "label": "deepseek-v4-flash-0731",
    "sublabel": "ee/deepseek-v4-flash-0731",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-flash-latest",
    "label": "deepseek-v4-flash-latest",
    "sublabel": "ee/deepseek-v4-flash-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "ee/deepseek-v4-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-pro-0813",
    "label": "deepseek-v4-pro-0813",
    "sublabel": "ee/deepseek-v4-pro-0813",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4.1-flash",
    "label": "deepseek-v4.1-flash",
    "sublabel": "ee/deepseek-v4.1-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/dolphin-mistral-24b-venice-edition",
    "label": "dolphin-mistral-24b-venice-edition",
    "sublabel": "ee/dolphin-mistral-24b-venice-edition",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ernie-4.5-vl-424b-a47b",
    "label": "ernie-4.5-vl-424b-a47b",
    "sublabel": "ee/ernie-4.5-vl-424b-a47b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/fugu-max",
    "label": "fugu-max",
    "sublabel": "ee/fugu-max",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/fugu-ultra",
    "label": "fugu-ultra",
    "sublabel": "ee/fugu-ultra",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/fugu-ultra-v2",
    "label": "fugu-ultra-v2",
    "sublabel": "ee/fugu-ultra-v2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-flash",
    "label": "gemini-2.5-flash",
    "sublabel": "ee/gemini-2.5-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-flash-image",
    "label": "gemini-2.5-flash-image",
    "sublabel": "ee/gemini-2.5-flash-image",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-flash-lite",
    "label": "gemini-2.5-flash-lite",
    "sublabel": "ee/gemini-2.5-flash-lite",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-pro",
    "label": "gemini-2.5-pro",
    "sublabel": "ee/gemini-2.5-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-pro-preview",
    "label": "gemini-2.5-pro-preview",
    "sublabel": "ee/gemini-2.5-pro-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3-flash-preview",
    "label": "gemini-3-flash-preview",
    "sublabel": "ee/gemini-3-flash-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3-pro-image",
    "label": "gemini-3-pro-image",
    "sublabel": "ee/gemini-3-pro-image",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.1-flash-image",
    "label": "gemini-3.1-flash-image",
    "sublabel": "ee/gemini-3.1-flash-image",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.1-flash-lite",
    "label": "gemini-3.1-flash-lite",
    "sublabel": "ee/gemini-3.1-flash-lite",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.1-flash-lite-image",
    "label": "gemini-3.1-flash-lite-image",
    "sublabel": "ee/gemini-3.1-flash-lite-image",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.1-pro-preview",
    "label": "gemini-3.1-pro-preview",
    "sublabel": "ee/gemini-3.1-pro-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.1-pro-preview-customtools",
    "label": "gemini-3.1-pro-preview-customtools",
    "sublabel": "ee/gemini-3.1-pro-preview-customtools",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.5-flash",
    "label": "gemini-3.5-flash",
    "sublabel": "ee/gemini-3.5-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.5-flash-lite",
    "label": "gemini-3.5-flash-lite",
    "sublabel": "ee/gemini-3.5-flash-lite",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.6-flash",
    "label": "gemini-3.6-flash",
    "sublabel": "ee/gemini-3.6-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.7-flash",
    "label": "gemini-3.7-flash",
    "sublabel": "ee/gemini-3.7-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-3.8-flash",
    "label": "gemini-3.8-flash",
    "sublabel": "ee/gemini-3.8-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-flash-latest",
    "label": "gemini-flash-latest",
    "sublabel": "ee/gemini-flash-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-pro-latest",
    "label": "gemini-pro-latest",
    "sublabel": "ee/gemini-pro-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-2-27b-it",
    "label": "gemma-2-27b-it",
    "sublabel": "ee/gemma-2-27b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-3-12b-it",
    "label": "gemma-3-12b-it",
    "sublabel": "ee/gemma-3-12b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-3-27b-it",
    "label": "gemma-3-27b-it",
    "sublabel": "ee/gemma-3-27b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-3-4b-it",
    "label": "gemma-3-4b-it",
    "sublabel": "ee/gemma-3-4b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-4-26b-a4b-it",
    "label": "gemma-4-26b-a4b-it",
    "sublabel": "ee/gemma-4-26b-a4b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-4-31b-it",
    "label": "gemma-4-31b-it",
    "sublabel": "ee/gemma-4-31b-it",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.6v",
    "label": "glm-4.6v",
    "sublabel": "ee/glm-4.6v",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.7",
    "label": "glm-4.7",
    "sublabel": "ee/glm-4.7",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5",
    "label": "glm-5",
    "sublabel": "ee/glm-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5-turbo",
    "label": "glm-5-turbo",
    "sublabel": "ee/glm-5-turbo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.1",
    "label": "glm-5.1",
    "sublabel": "ee/glm-5.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "ee/glm-5.2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.2-fast",
    "label": "glm-5.2-fast",
    "sublabel": "ee/glm-5.2-fast",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.3",
    "label": "glm-5.3",
    "sublabel": "ee/glm-5.3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.3-flash",
    "label": "glm-5.3-flash",
    "sublabel": "ee/glm-5.3-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5.3-flash-abliterated",
    "label": "glm-5.3-flash-abliterated",
    "sublabel": "ee/glm-5.3-flash-abliterated",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-5v-turbo",
    "label": "glm-5v-turbo",
    "sublabel": "ee/glm-5v-turbo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-latest",
    "label": "glm-latest",
    "sublabel": "ee/glm-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-3.5-turbo",
    "label": "gpt-3.5-turbo",
    "sublabel": "ee/gpt-3.5-turbo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-3.5-turbo-0613",
    "label": "gpt-3.5-turbo-0613",
    "sublabel": "ee/gpt-3.5-turbo-0613",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-3.5-turbo-16k",
    "label": "gpt-3.5-turbo-16k",
    "sublabel": "ee/gpt-3.5-turbo-16k",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-3.5-turbo-instruct",
    "label": "gpt-3.5-turbo-instruct",
    "sublabel": "ee/gpt-3.5-turbo-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4-turbo",
    "label": "gpt-4-turbo",
    "sublabel": "ee/gpt-4-turbo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4.1",
    "label": "gpt-4.1",
    "sublabel": "ee/gpt-4.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4.1-mini",
    "label": "gpt-4.1-mini",
    "sublabel": "ee/gpt-4.1-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4.1-nano",
    "label": "gpt-4.1-nano",
    "sublabel": "ee/gpt-4.1-nano",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4o",
    "label": "gpt-4o",
    "sublabel": "ee/gpt-4o",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4o-mini",
    "label": "gpt-4o-mini",
    "sublabel": "ee/gpt-4o-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5",
    "label": "gpt-5",
    "sublabel": "ee/gpt-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5-mini",
    "label": "gpt-5-mini",
    "sublabel": "ee/gpt-5-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5-nano",
    "label": "gpt-5-nano",
    "sublabel": "ee/gpt-5-nano",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.1",
    "label": "gpt-5.1",
    "sublabel": "ee/gpt-5.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.1-codex",
    "label": "gpt-5.1-codex",
    "sublabel": "ee/gpt-5.1-codex",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.1-codex-max",
    "label": "gpt-5.1-codex-max",
    "sublabel": "ee/gpt-5.1-codex-max",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.1-codex-mini",
    "label": "gpt-5.1-codex-mini",
    "sublabel": "ee/gpt-5.1-codex-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.2",
    "label": "gpt-5.2",
    "sublabel": "ee/gpt-5.2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.2-codex",
    "label": "gpt-5.2-codex",
    "sublabel": "ee/gpt-5.2-codex",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.3-codex",
    "label": "gpt-5.3-codex",
    "sublabel": "ee/gpt-5.3-codex",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.4",
    "label": "gpt-5.4",
    "sublabel": "ee/gpt-5.4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.4-image-2",
    "label": "gpt-5.4-image-2",
    "sublabel": "ee/gpt-5.4-image-2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.4-mini",
    "label": "gpt-5.4-mini",
    "sublabel": "ee/gpt-5.4-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.4-nano",
    "label": "gpt-5.4-nano",
    "sublabel": "ee/gpt-5.4-nano",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "ee/gpt-5.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.5-pro",
    "label": "gpt-5.5-pro",
    "sublabel": "ee/gpt-5.5-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "ee/gpt-5.6-luna",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-luna-pro",
    "label": "gpt-5.6-luna-pro",
    "sublabel": "ee/gpt-5.6-luna-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "ee/gpt-5.6-sol",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "ee/gpt-5.6-terra",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6-astra",
    "label": "gpt-6-astra",
    "sublabel": "ee/gpt-6-astra",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "ee/gpt-6-luna",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6-luna-decisions",
    "label": "gpt-6-luna-decisions",
    "sublabel": "ee/gpt-6-luna-decisions",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6-sol",
    "label": "gpt-6-sol",
    "sublabel": "ee/gpt-6-sol",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6.1-sol",
    "label": "gpt-6.1-sol",
    "sublabel": "ee/gpt-6.1-sol",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-chat-latest",
    "label": "gpt-chat-latest",
    "sublabel": "ee/gpt-chat-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-latest",
    "label": "gpt-latest",
    "sublabel": "ee/gpt-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-mini-latest",
    "label": "gpt-mini-latest",
    "sublabel": "ee/gpt-mini-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-oss-120b",
    "label": "gpt-oss-120b",
    "sublabel": "ee/gpt-oss-120b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-oss-20b",
    "label": "gpt-oss-20b",
    "sublabel": "ee/gpt-oss-20b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-oss-safeguard-20b",
    "label": "gpt-oss-safeguard-20b",
    "sublabel": "ee/gpt-oss-safeguard-20b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/granite-4.0-h-micro",
    "label": "granite-4.0-h-micro",
    "sublabel": "ee/granite-4.0-h-micro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4",
    "label": "grok-4",
    "sublabel": "ee/grok-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4-1-fast-non-reasoning",
    "label": "grok-4-1-fast-non-reasoning",
    "sublabel": "ee/grok-4-1-fast-non-reasoning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4-1-fast-reasoning",
    "label": "grok-4-1-fast-reasoning",
    "sublabel": "ee/grok-4-1-fast-reasoning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.20",
    "label": "grok-4.20",
    "sublabel": "ee/grok-4.20",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.20-multi-agent",
    "label": "grok-4.20-multi-agent",
    "sublabel": "ee/grok-4.20-multi-agent",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.20-non-reasoning",
    "label": "grok-4.20-non-reasoning",
    "sublabel": "ee/grok-4.20-non-reasoning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.3",
    "label": "grok-4.3",
    "sublabel": "ee/grok-4.3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.5",
    "label": "grok-4.5",
    "sublabel": "ee/grok-4.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.6",
    "label": "grok-4.6",
    "sublabel": "ee/grok-4.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-4.7",
    "label": "grok-4.7",
    "sublabel": "ee/grok-4.7",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-build-0.1",
    "label": "grok-build-0.1",
    "sublabel": "ee/grok-build-0.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-code-fast-1",
    "label": "grok-code-fast-1",
    "sublabel": "ee/grok-code-fast-1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/grok-latest",
    "label": "grok-latest",
    "sublabel": "ee/grok-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hermes-3-llama-3.1-405b",
    "label": "hermes-3-llama-3.1-405b",
    "sublabel": "ee/hermes-3-llama-3.1-405b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hermes-3-llama-3.1-70b",
    "label": "hermes-3-llama-3.1-70b",
    "sublabel": "ee/hermes-3-llama-3.1-70b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hermes-4-405b",
    "label": "hermes-4-405b",
    "sublabel": "ee/hermes-4-405b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hunyuan-a13b-instruct",
    "label": "hunyuan-a13b-instruct",
    "sublabel": "ee/hunyuan-a13b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy-mt2-1.8b",
    "label": "hy-mt2-1.8b",
    "sublabel": "ee/hy-mt2-1.8b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy-mt2-30b-a3b",
    "label": "hy-mt2-30b-a3b",
    "sublabel": "ee/hy-mt2-30b-a3b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy-mt2-7b",
    "label": "hy-mt2-7b",
    "sublabel": "ee/hy-mt2-7b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy3",
    "label": "hy3",
    "sublabel": "ee/hy3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy3-preview",
    "label": "hy3-preview",
    "sublabel": "ee/hy3-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/hy4-preview",
    "label": "hy4-preview",
    "sublabel": "ee/hy4-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/inkling",
    "label": "inkling",
    "sublabel": "ee/inkling",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/inkling-small",
    "label": "inkling-small",
    "sublabel": "ee/inkling-small",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/jev-latest",
    "label": "jev-latest",
    "sublabel": "ee/jev-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k2-0905",
    "label": "kimi-k2-0905",
    "sublabel": "ee/kimi-k2-0905",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k2-thinking",
    "label": "kimi-k2-thinking",
    "sublabel": "ee/kimi-k2-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k2.5",
    "label": "kimi-k2.5",
    "sublabel": "ee/kimi-k2.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k2.6",
    "label": "kimi-k2.6",
    "sublabel": "ee/kimi-k2.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k2.7-code",
    "label": "kimi-k2.7-code",
    "sublabel": "ee/kimi-k2.7-code",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-k3",
    "label": "kimi-k3",
    "sublabel": "ee/kimi-k3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kimi-latest",
    "label": "kimi-latest",
    "sublabel": "ee/kimi-latest",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/laguna-s-2.1",
    "label": "laguna-s-2.1",
    "sublabel": "ee/laguna-s-2.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/laguna-xs-2.1",
    "label": "laguna-xs-2.1",
    "sublabel": "ee/laguna-xs-2.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.0-flash",
    "label": "ling-3.0-flash",
    "sublabel": "ee/ling-3.0-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.0-flash-fin",
    "label": "ling-3.0-flash-fin",
    "sublabel": "ee/ling-3.0-flash-fin",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.0-flash-sante",
    "label": "ling-3.0-flash-sante",
    "sublabel": "ee/ling-3.0-flash-sante",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.0-flash-vl",
    "label": "ling-3.0-flash-vl",
    "sublabel": "ee/ling-3.0-flash-vl",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.1-flash",
    "label": "ling-3.1-flash",
    "sublabel": "ee/ling-3.1-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-3-lunaris-8b",
    "label": "llama-3-lunaris-8b",
    "sublabel": "ee/llama-3-lunaris-8b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-3.1-70b-instruct",
    "label": "llama-3.1-70b-instruct",
    "sublabel": "ee/llama-3.1-70b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-3.1-euryale-70b",
    "label": "llama-3.1-euryale-70b",
    "sublabel": "ee/llama-3.1-euryale-70b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-3.3-70b-instruct",
    "label": "llama-3.3-70b-instruct",
    "sublabel": "ee/llama-3.3-70b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-3.3-euryale-70b",
    "label": "llama-3.3-euryale-70b",
    "sublabel": "ee/llama-3.3-euryale-70b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-4-maverick",
    "label": "llama-4-maverick",
    "sublabel": "ee/llama-4-maverick",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-4-scout",
    "label": "llama-4-scout",
    "sublabel": "ee/llama-4-scout",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/llama-guard-4-12b",
    "label": "llama-guard-4-12b",
    "sublabel": "ee/llama-guard-4-12b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/longcat-2.0",
    "label": "longcat-2.0",
    "sublabel": "ee/longcat-2.0",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/magnum-v4-72b",
    "label": "magnum-v4-72b",
    "sublabel": "ee/magnum-v4-72b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mercury-2",
    "label": "mercury-2",
    "sublabel": "ee/mercury-2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "ee/mimo-v2.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "ee/mimo-v2.5-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mimo-v2.6-flash",
    "label": "mimo-v2.6-flash",
    "sublabel": "ee/mimo-v2.6-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mimo-v2.6-pro",
    "label": "mimo-v2.6-pro",
    "sublabel": "ee/mimo-v2.6-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mimo-v2.6-pro-ultraspeed",
    "label": "mimo-v2.6-pro-ultraspeed",
    "sublabel": "ee/mimo-v2.6-pro-ultraspeed",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-01",
    "label": "minimax-01",
    "sublabel": "ee/minimax-01",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m1",
    "label": "minimax-m1",
    "sublabel": "ee/minimax-m1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m2",
    "label": "minimax-m2",
    "sublabel": "ee/minimax-m2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m2-her",
    "label": "minimax-m2-her",
    "sublabel": "ee/minimax-m2-her",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m2.1",
    "label": "minimax-m2.1",
    "sublabel": "ee/minimax-m2.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m2.5",
    "label": "minimax-m2.5",
    "sublabel": "ee/minimax-m2.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "ee/minimax-m3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ministral-14b-2512",
    "label": "ministral-14b-2512",
    "sublabel": "ee/ministral-14b-2512",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ministral-3-3b-instruct",
    "label": "ministral-3-3b-instruct",
    "sublabel": "ee/ministral-3-3b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ministral-3-8b-instruct",
    "label": "ministral-3-8b-instruct",
    "sublabel": "ee/ministral-3-8b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large",
    "label": "mistral-large",
    "sublabel": "ee/mistral-large",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large-2407",
    "label": "mistral-large-2407",
    "sublabel": "ee/mistral-large-2407",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large-3",
    "label": "mistral-large-3",
    "sublabel": "ee/mistral-large-3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large-4",
    "label": "mistral-large-4",
    "sublabel": "ee/mistral-large-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-medium-3",
    "label": "mistral-medium-3",
    "sublabel": "ee/mistral-medium-3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-medium-3-5",
    "label": "mistral-medium-3-5",
    "sublabel": "ee/mistral-medium-3-5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-medium-3.1",
    "label": "mistral-medium-3.1",
    "sublabel": "ee/mistral-medium-3.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-nemo",
    "label": "mistral-nemo",
    "sublabel": "ee/mistral-nemo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-saba",
    "label": "mistral-saba",
    "sublabel": "ee/mistral-saba",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-small-2603",
    "label": "mistral-small-2603",
    "sublabel": "ee/mistral-small-2603",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-small-3.1-24b-instruct",
    "label": "mistral-small-3.1-24b-instruct",
    "sublabel": "ee/mistral-small-3.1-24b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-small-3.2-24b-instruct",
    "label": "mistral-small-3.2-24b-instruct",
    "sublabel": "ee/mistral-small-3.2-24b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mixtral-8x22b-instruct",
    "label": "mixtral-8x22b-instruct",
    "sublabel": "ee/mixtral-8x22b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/morph-v3-fast",
    "label": "morph-v3-fast",
    "sublabel": "ee/morph-v3-fast",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/morph-v3-large",
    "label": "morph-v3-large",
    "sublabel": "ee/morph-v3-large",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/muse-spark-1.1",
    "label": "muse-spark-1.1",
    "sublabel": "ee/muse-spark-1.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/muse-spark-1.2",
    "label": "muse-spark-1.2",
    "sublabel": "ee/muse-spark-1.2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/muse-spark-1.2-contributor",
    "label": "muse-spark-1.2-contributor",
    "sublabel": "ee/muse-spark-1.2-contributor",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/muse-spark-1.3",
    "label": "muse-spark-1.3",
    "sublabel": "ee/muse-spark-1.3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/muse-spark-1.3-contributor",
    "label": "muse-spark-1.3-contributor",
    "sublabel": "ee/muse-spark-1.3-contributor",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3-nano-30b-a3b",
    "label": "nemotron-3-nano-30b-a3b",
    "sublabel": "ee/nemotron-3-nano-30b-a3b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3-super-120b-a12b",
    "label": "nemotron-3-super-120b-a12b",
    "sublabel": "ee/nemotron-3-super-120b-a12b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3-ultra-550b-a55b",
    "label": "nemotron-3-ultra-550b-a55b",
    "sublabel": "ee/nemotron-3-ultra-550b-a55b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3.5-lightning",
    "label": "nemotron-3.5-lightning",
    "sublabel": "ee/nemotron-3.5-lightning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nova-2-lite-v1",
    "label": "nova-2-lite-v1",
    "sublabel": "ee/nova-2-lite-v1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nova-premier-v1",
    "label": "nova-premier-v1",
    "sublabel": "ee/nova-premier-v1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o3",
    "label": "o3",
    "sublabel": "ee/o3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o3-mini",
    "label": "o3-mini",
    "sublabel": "ee/o3-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o3-mini-high",
    "label": "o3-mini-high",
    "sublabel": "ee/o3-mini-high",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o4-mini",
    "label": "o4-mini",
    "sublabel": "ee/o4-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o4-mini-high",
    "label": "o4-mini-high",
    "sublabel": "ee/o4-mini-high",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/perceptron-mk1",
    "label": "perceptron-mk1",
    "sublabel": "ee/perceptron-mk1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/phi-4",
    "label": "phi-4",
    "sublabel": "ee/phi-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen-mt-plus",
    "label": "qwen-mt-plus",
    "sublabel": "ee/qwen-mt-plus",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen-plus",
    "label": "qwen-plus",
    "sublabel": "ee/qwen-plus",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen-plus-2025-07-28",
    "label": "qwen-plus-2025-07-28",
    "sublabel": "ee/qwen-plus-2025-07-28",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen2.5-vl-72b-instruct",
    "label": "qwen2.5-vl-72b-instruct",
    "sublabel": "ee/qwen2.5-vl-72b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-14b",
    "label": "qwen3-14b",
    "sublabel": "ee/qwen3-14b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-235b-a22b-instruct-2507",
    "label": "qwen3-235b-a22b-instruct-2507",
    "sublabel": "ee/qwen3-235b-a22b-instruct-2507",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-32b",
    "label": "qwen3-32b",
    "sublabel": "ee/qwen3-32b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-coder-480b-a35b-instruct",
    "label": "qwen3-coder-480b-a35b-instruct",
    "sublabel": "ee/qwen3-coder-480b-a35b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-coder-flash",
    "label": "qwen3-coder-flash",
    "sublabel": "ee/qwen3-coder-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-coder-plus",
    "label": "qwen3-coder-plus",
    "sublabel": "ee/qwen3-coder-plus",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-max",
    "label": "qwen3-max",
    "sublabel": "ee/qwen3-max",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-max-thinking",
    "label": "qwen3-max-thinking",
    "sublabel": "ee/qwen3-max-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-next-80b-a3b-instruct",
    "label": "qwen3-next-80b-a3b-instruct",
    "sublabel": "ee/qwen3-next-80b-a3b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-next-80b-a3b-thinking",
    "label": "qwen3-next-80b-a3b-thinking",
    "sublabel": "ee/qwen3-next-80b-a3b-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-omni-30b-a3b-thinking",
    "label": "qwen3-omni-30b-a3b-thinking",
    "sublabel": "ee/qwen3-omni-30b-a3b-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-vl-235b-a22b-instruct",
    "label": "qwen3-vl-235b-a22b-instruct",
    "sublabel": "ee/qwen3-vl-235b-a22b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-vl-8b-thinking",
    "label": "qwen3-vl-8b-thinking",
    "sublabel": "ee/qwen3-vl-8b-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-122b-a10b",
    "label": "qwen3.5-122b-a10b",
    "sublabel": "ee/qwen3.5-122b-a10b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-27b",
    "label": "qwen3.5-27b",
    "sublabel": "ee/qwen3.5-27b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-35b-a3b",
    "label": "qwen3.5-35b-a3b",
    "sublabel": "ee/qwen3.5-35b-a3b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-397b-a17b",
    "label": "qwen3.5-397b-a17b",
    "sublabel": "ee/qwen3.5-397b-a17b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-9b",
    "label": "qwen3.5-9b",
    "sublabel": "ee/qwen3.5-9b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-flash-02-23",
    "label": "qwen3.5-flash-02-23",
    "sublabel": "ee/qwen3.5-flash-02-23",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-plus-02-15",
    "label": "qwen3.5-plus-02-15",
    "sublabel": "ee/qwen3.5-plus-02-15",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.5-plus-20260420",
    "label": "qwen3.5-plus-20260420",
    "sublabel": "ee/qwen3.5-plus-20260420",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.6-27b",
    "label": "qwen3.6-27b",
    "sublabel": "ee/qwen3.6-27b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.6-35b-a3b",
    "label": "qwen3.6-35b-a3b",
    "sublabel": "ee/qwen3.6-35b-a3b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.6-flash",
    "label": "qwen3.6-flash",
    "sublabel": "ee/qwen3.6-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.6-max-preview",
    "label": "qwen3.6-max-preview",
    "sublabel": "ee/qwen3.6-max-preview",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.6-plus",
    "label": "qwen3.6-plus",
    "sublabel": "ee/qwen3.6-plus",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.7-flash",
    "label": "qwen3.7-flash",
    "sublabel": "ee/qwen3.7-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.7-max",
    "label": "qwen3.7-max",
    "sublabel": "ee/qwen3.7-max",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.7-plus",
    "label": "qwen3.7-plus",
    "sublabel": "ee/qwen3.7-plus",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-2.4t-a95b",
    "label": "qwen3.8-2.4t-a95b",
    "sublabel": "ee/qwen3.8-2.4t-a95b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-27b",
    "label": "qwen3.8-27b",
    "sublabel": "ee/qwen3.8-27b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-flash",
    "label": "qwen3.8-flash",
    "sublabel": "ee/qwen3.8-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-flash-next-uncensored",
    "label": "qwen3.8-flash-next-uncensored",
    "sublabel": "ee/qwen3.8-flash-next-uncensored",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-max",
    "label": "qwen3.8-max",
    "sublabel": "ee/qwen3.8-max",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3.8-max-0902",
    "label": "qwen3.8-max-0902",
    "sublabel": "ee/qwen3.8-max-0902",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/reka-edge",
    "label": "reka-edge",
    "sublabel": "ee/reka-edge",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/reka-flash-3",
    "label": "reka-flash-3",
    "sublabel": "ee/reka-flash-3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/relace-apply-3",
    "label": "relace-apply-3",
    "sublabel": "ee/relace-apply-3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/relace-search",
    "label": "relace-search",
    "sublabel": "ee/relace-search",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/remm-slerp-l2-13b",
    "label": "remm-slerp-l2-13b",
    "sublabel": "ee/remm-slerp-l2-13b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-1.6",
    "label": "seed-1.6",
    "sublabel": "ee/seed-1.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-1.6-flash",
    "label": "seed-1.6-flash",
    "sublabel": "ee/seed-1.6-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-2-1-turbo",
    "label": "seed-2-1-turbo",
    "sublabel": "ee/seed-2-1-turbo",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-2.0-code",
    "label": "seed-2.0-code",
    "sublabel": "ee/seed-2.0-code",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-2.0-lite",
    "label": "seed-2.0-lite",
    "sublabel": "ee/seed-2.0-lite",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/seed-2.0-mini",
    "label": "seed-2.0-mini",
    "sublabel": "ee/seed-2.0-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/skyfall-36b-v2",
    "label": "skyfall-36b-v2",
    "sublabel": "ee/skyfall-36b-v2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/solar-pro-3",
    "label": "solar-pro-3",
    "sublabel": "ee/solar-pro-3",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/solar-pro4",
    "label": "solar-pro4",
    "sublabel": "ee/solar-pro4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/sonar",
    "label": "sonar",
    "sublabel": "ee/sonar",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/sonar-pro",
    "label": "sonar-pro",
    "sublabel": "ee/sonar-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/sonar-pro-search",
    "label": "sonar-pro-search",
    "sublabel": "ee/sonar-pro-search",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/sonar-reasoning-pro",
    "label": "sonar-reasoning-pro",
    "sublabel": "ee/sonar-reasoning-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/step-3.5-flash",
    "label": "step-3.5-flash",
    "sublabel": "ee/step-3.5-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/trinity-large-thinking",
    "label": "trinity-large-thinking",
    "sublabel": "ee/trinity-large-thinking",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ui-tars-1.5-7b",
    "label": "ui-tars-1.5-7b",
    "sublabel": "ee/ui-tars-1.5-7b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/unslopnemo-12b",
    "label": "unslopnemo-12b",
    "sublabel": "ee/unslopnemo-12b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/weaver",
    "label": "weaver",
    "sublabel": "ee/weaver",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/wizardlm-2-8x22b",
    "label": "wizardlm-2-8x22b",
    "sublabel": "ee/wizardlm-2-8x22b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-3-haiku",
    "label": "claude-3-haiku",
    "sublabel": "ee/claude-3-haiku",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4",
    "label": "claude-opus-4",
    "sublabel": "ee/claude-opus-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-4.8-fast",
    "label": "claude-opus-4.8-fast",
    "sublabel": "ee/claude-opus-4.8-fast",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/claude-opus-5-fast",
    "label": "claude-opus-5-fast",
    "sublabel": "ee/claude-opus-5-fast",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v3.1",
    "label": "deepseek-v3.1",
    "sublabel": "ee/deepseek-v3.1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/deepseek-v4-flash-vision-exp",
    "label": "deepseek-v4-flash-vision-exp",
    "sublabel": "ee/deepseek-v4-flash-vision-exp",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/devstral-2-123b",
    "label": "devstral-2-123b",
    "sublabel": "ee/devstral-2-123b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemini-2.5-pro-preview-05-06",
    "label": "gemini-2.5-pro-preview-05-06",
    "sublabel": "ee/gemini-2.5-pro-preview-05-06",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/free",
    "label": "free",
    "sublabel": "ee/free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-4-26b-a4b-it-free",
    "label": "gemma-4-26b-a4b-it-free",
    "sublabel": "ee/gemma-4-26b-a4b-it-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gemma-4-31b",
    "label": "gemma-4-31b",
    "sublabel": "ee/gemma-4-31b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4-32b-0414-128k",
    "label": "glm-4-32b-0414-128k",
    "sublabel": "ee/glm-4-32b-0414-128k",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5",
    "label": "glm-4.5",
    "sublabel": "ee/glm-4.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5-air",
    "label": "glm-4.5-air",
    "sublabel": "ee/glm-4.5-air",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5-airx",
    "label": "glm-4.5-airx",
    "sublabel": "ee/glm-4.5-airx",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5-flash",
    "label": "glm-4.5-flash",
    "sublabel": "ee/glm-4.5-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5-x",
    "label": "glm-4.5-x",
    "sublabel": "ee/glm-4.5-x",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.5v",
    "label": "glm-4.5v",
    "sublabel": "ee/glm-4.5v",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.6",
    "label": "glm-4.6",
    "sublabel": "ee/glm-4.6",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.6v-flash",
    "label": "glm-4.6v-flash",
    "sublabel": "ee/glm-4.6v-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.6v-flashx",
    "label": "glm-4.6v-flashx",
    "sublabel": "ee/glm-4.6v-flashx",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.7-flash",
    "label": "glm-4.7-flash",
    "sublabel": "ee/glm-4.7-flash",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/glm-4.7-flashx",
    "label": "glm-4.7-flashx",
    "sublabel": "ee/glm-4.7-flashx",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-4",
    "label": "gpt-4",
    "sublabel": "ee/gpt-4",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5-image",
    "label": "gpt-5-image",
    "sublabel": "ee/gpt-5-image",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5-image-mini",
    "label": "gpt-5-image-mini",
    "sublabel": "ee/gpt-5-image-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5-pro",
    "label": "gpt-5-pro",
    "sublabel": "ee/gpt-5-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.2-chat",
    "label": "gpt-5.2-chat",
    "sublabel": "ee/gpt-5.2-chat",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.2-pro",
    "label": "gpt-5.2-pro",
    "sublabel": "ee/gpt-5.2-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.4-pro",
    "label": "gpt-5.4-pro",
    "sublabel": "ee/gpt-5.4-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-sol-pro",
    "label": "gpt-5.6-sol-pro",
    "sublabel": "ee/gpt-5.6-sol-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-5.6-terra-pro",
    "label": "gpt-5.6-terra-pro",
    "sublabel": "ee/gpt-5.6-terra-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-6-astra-pro",
    "label": "gpt-6-astra-pro",
    "sublabel": "ee/gpt-6-astra-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/gpt-oss-safeguard-120b",
    "label": "gpt-oss-safeguard-120b",
    "sublabel": "ee/gpt-oss-safeguard-120b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kat-coder-pro-v2",
    "label": "kat-coder-pro-v2",
    "sublabel": "ee/kat-coder-pro-v2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/kat-coder-pro-v2.5",
    "label": "kat-coder-pro-v2.5",
    "sublabel": "ee/kat-coder-pro-v2.5",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/laguna-s-2.1-free",
    "label": "laguna-s-2.1-free",
    "sublabel": "ee/laguna-s-2.1-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/laguna-xs-2.1-free",
    "label": "laguna-xs-2.1-free",
    "sublabel": "ee/laguna-xs-2.1-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/lfm-2.5-2.6b-free",
    "label": "lfm-2.5-2.6b-free",
    "sublabel": "ee/lfm-2.5-2.6b-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ling-3.0-flash-fin-free",
    "label": "ling-3.0-flash-fin-free",
    "sublabel": "ee/ling-3.0-flash-fin-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/magistral-small-2509",
    "label": "magistral-small-2509",
    "sublabel": "ee/magistral-small-2509",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m2.7-free",
    "label": "minimax-m2.7-free",
    "sublabel": "ee/minimax-m2.7-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/minimax-m3-free",
    "label": "minimax-m3-free",
    "sublabel": "ee/minimax-m3-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-7b-instruct-v0p2",
    "label": "mistral-7b-instruct-v0p2",
    "sublabel": "ee/mistral-7b-instruct-v0p2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large-2512",
    "label": "mistral-large-2512",
    "sublabel": "ee/mistral-large-2512",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mistral-large-3-675b-instruct",
    "label": "mistral-large-3-675b-instruct",
    "sublabel": "ee/mistral-large-3-675b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/mixtral-8x7b-instruct",
    "label": "mixtral-8x7b-instruct",
    "sublabel": "ee/mixtral-8x7b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3-nano-omni-30b-a3b-reasoning-free",
    "label": "nemotron-3-nano-omni-30b-a3b-reasoning-free",
    "sublabel": "ee/nemotron-3-nano-omni-30b-a3b-reasoning-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3-ultra-550b-a55b-free",
    "label": "nemotron-3-ultra-550b-a55b-free",
    "sublabel": "ee/nemotron-3-ultra-550b-a55b-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-3.5-content-safety-free",
    "label": "nemotron-3.5-content-safety-free",
    "sublabel": "ee/nemotron-3.5-content-safety-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-nano-12b-v2",
    "label": "nemotron-nano-12b-v2",
    "sublabel": "ee/nemotron-nano-12b-v2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nemotron-nano-9b-v2",
    "label": "nemotron-nano-9b-v2",
    "sublabel": "ee/nemotron-nano-9b-v2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nex-n2-mini",
    "label": "nex-n2-mini",
    "sublabel": "ee/nex-n2-mini",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/nex-n2-pro",
    "label": "nex-n2-pro",
    "sublabel": "ee/nex-n2-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/north-mini-code-free",
    "label": "north-mini-code-free",
    "sublabel": "ee/north-mini-code-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o1",
    "label": "o1",
    "sublabel": "ee/o1",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o1-pro",
    "label": "o1-pro",
    "sublabel": "ee/o1-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/o3-pro",
    "label": "o3-pro",
    "sublabel": "ee/o3-pro",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/openrouter-free",
    "label": "openrouter-free",
    "sublabel": "ee/openrouter-free",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/palmyra-vision-7b",
    "label": "palmyra-vision-7b",
    "sublabel": "ee/palmyra-vision-7b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/phi-4-mini-instruct",
    "label": "phi-4-mini-instruct",
    "sublabel": "ee/phi-4-mini-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/phi-4-mini-reasoning",
    "label": "phi-4-mini-reasoning",
    "sublabel": "ee/phi-4-mini-reasoning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/phi-4-multimodal-instruct",
    "label": "phi-4-multimodal-instruct",
    "sublabel": "ee/phi-4-multimodal-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/phi-4-reasoning",
    "label": "phi-4-reasoning",
    "sublabel": "ee/phi-4-reasoning",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/ppocrv6-medium-det",
    "label": "ppocrv6-medium-det",
    "sublabel": "ee/ppocrv6-medium-det",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-coder-30b-a3b-instruct",
    "label": "qwen3-coder-30b-a3b-instruct",
    "sublabel": "ee/qwen3-coder-30b-a3b-instruct",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-coder-next",
    "label": "qwen3-coder-next",
    "sublabel": "ee/qwen3-coder-next",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/qwen3-next-80b-a3b",
    "label": "qwen3-next-80b-a3b",
    "sublabel": "ee/qwen3-next-80b-a3b",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/sonar-deep-research",
    "label": "sonar-deep-research",
    "sublabel": "ee/sonar-deep-research",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/v3.2",
    "label": "v3.2",
    "sublabel": "ee/v3.2",
    "badge": "ee"
  },
  {
    "value": "adit-9router/ee/voxtral-mini-3b-2507",
    "label": "voxtral-mini-3b-2507",
    "sublabel": "ee/voxtral-mini-3b-2507",
    "badge": "ee"
  },
  {
    "value": "adit-9router/bansos/ling-3.1-flash-free",
    "label": "ling-3.1-flash-free",
    "sublabel": "bansos/ling-3.1-flash-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/longcat-2.5-preview-free",
    "label": "longcat-2.5-preview-free",
    "sublabel": "bansos/longcat-2.5-preview-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/space-bunny-free",
    "label": "space-bunny-free",
    "sublabel": "bansos/space-bunny-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/mimo-v2.6-flash-free",
    "label": "mimo-v2.6-flash-free",
    "sublabel": "bansos/mimo-v2.6-flash-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nemotron-3.5-lightning-free",
    "label": "nemotron-3.5-lightning-free",
    "sublabel": "bansos/nemotron-3.5-lightning-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/big-pickle",
    "label": "big-pickle",
    "sublabel": "bansos/big-pickle",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/step-5-preview-free",
    "label": "step-5-preview-free",
    "sublabel": "bansos/step-5-preview-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/muse-spark-1.3-contributor-free",
    "label": "muse-spark-1.3-contributor-free",
    "sublabel": "bansos/muse-spark-1.3-contributor-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nemotron-3-ultra-free",
    "label": "nemotron-3-ultra-free",
    "sublabel": "bansos/nemotron-3-ultra-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/muse-spark-1.2-contributor-free",
    "label": "muse-spark-1.2-contributor-free",
    "sublabel": "bansos/muse-spark-1.2-contributor-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/kilo-auto/free",
    "label": "kilo-auto · free",
    "sublabel": "bansos/kilo-auto/free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/dots-studio/dots-3-note-preview:free",
    "label": "dots-studio · dots-3-note-preview:free",
    "sublabel": "bansos/dots-studio/dots-3-note-preview:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/liquid/lfm-2.5-2.6b:free",
    "label": "liquid · lfm-2.5-2.6b:free",
    "sublabel": "bansos/liquid/lfm-2.5-2.6b:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nvidia/nemotron-3.5-lightning:free",
    "label": "nvidia · nemotron-3.5-lightning:free",
    "sublabel": "bansos/nvidia/nemotron-3.5-lightning:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/thinkingmachines/inkling-small:free",
    "label": "thinkingmachines · inkling-small:free",
    "sublabel": "bansos/thinkingmachines/inkling-small:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/poolside/laguna-s-2.1:free",
    "label": "poolside · laguna-s-2.1:free",
    "sublabel": "bansos/poolside/laguna-s-2.1:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/poolside/laguna-xs-2.1:free",
    "label": "poolside · laguna-xs-2.1:free",
    "sublabel": "bansos/poolside/laguna-xs-2.1:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/cohere/north-mini-code:free",
    "label": "cohere · north-mini-code:free",
    "sublabel": "bansos/cohere/north-mini-code:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nvidia/nemotron-3.5-content-safety:free",
    "label": "nvidia · nemotron-3.5-content-safety:free",
    "sublabel": "bansos/nvidia/nemotron-3.5-content-safety:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nvidia/nemotron-3-ultra-550b-a55b:free",
    "label": "nvidia · nemotron-3-ultra-550b-a55b:free",
    "sublabel": "bansos/nvidia/nemotron-3-ultra-550b-a55b:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "label": "nvidia · nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "sublabel": "bansos/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nvidia/nemotron-3-super-120b-a12b:free",
    "label": "nvidia · nemotron-3-super-120b-a12b:free",
    "sublabel": "bansos/nvidia/nemotron-3-super-120b-a12b:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/openrouter/free",
    "label": "openrouter · free",
    "sublabel": "bansos/openrouter/free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/DeepSeek-V4-Flash-0731",
    "label": "DeepSeek-V4-Flash-0731",
    "sublabel": "bansos/DeepSeek-V4-Flash-0731",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/GLM-5.3-Flash",
    "label": "GLM-5.3-Flash",
    "sublabel": "bansos/GLM-5.3-Flash",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/codestral-latest",
    "label": "codestral-latest",
    "sublabel": "bansos/codestral-latest",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/gpt-oss:20b",
    "label": "gpt-oss:20b",
    "sublabel": "bansos/gpt-oss:20b",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/kimi-k2.6",
    "label": "kimi-k2.6",
    "sublabel": "bansos/kimi-k2.6",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/kimi-k2.7-code",
    "label": "kimi-k2.7-code",
    "sublabel": "bansos/kimi-k2.7-code",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/mistral-Nemo-Instruct-2407",
    "label": "mistral-Nemo-Instruct-2407",
    "sublabel": "bansos/mistral-Nemo-Instruct-2407",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nemotron-3-nano:30b",
    "label": "nemotron-3-nano:30b",
    "sublabel": "bansos/nemotron-3-nano:30b",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/default",
    "label": "default",
    "sublabel": "bansos/default",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/fast",
    "label": "fast",
    "sublabel": "bansos/fast",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/ling-3.0-flash-fin-free",
    "label": "ling-3.0-flash-fin-free",
    "sublabel": "bansos/ling-3.0-flash-fin-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nex-agi/nex-n2.5-pro:free",
    "label": "nex-agi · nex-n2.5-pro:free",
    "sublabel": "bansos/nex-agi/nex-n2.5-pro:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/nex-agi/nex-n2.5-mini:free",
    "label": "nex-agi · nex-n2.5-mini:free",
    "sublabel": "bansos/nex-agi/nex-n2.5-mini:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/inclusionai/ling-3.0-flash-sante:free",
    "label": "inclusionai · ling-3.0-flash-sante:free",
    "sublabel": "bansos/inclusionai/ling-3.0-flash-sante:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/inclusionai/ling-3.0-flash-fin:free",
    "label": "inclusionai · ling-3.0-flash-fin:free",
    "sublabel": "bansos/inclusionai/ling-3.0-flash-fin:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/qwen/qwen3.8-27b:free",
    "label": "qwen · qwen3.8-27b:free",
    "sublabel": "bansos/qwen/qwen3.8-27b:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/z-ai/glm-5.2:free",
    "label": "z-ai · glm-5.2:free",
    "sublabel": "bansos/z-ai/glm-5.2:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/stepfun/step-3.7-flash:free",
    "label": "stepfun · step-3.7-flash:free",
    "sublabel": "bansos/stepfun/step-3.7-flash:free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/minimax-m2.7",
    "label": "minimax-m2.7",
    "sublabel": "bansos/minimax-m2.7",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/mimo-v2.5-free",
    "label": "mimo-v2.5-free",
    "sublabel": "bansos/mimo-v2.5-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/exo-free",
    "label": "exo-free",
    "sublabel": "bansos/exo-free",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/gemma4:31b",
    "label": "gemma4:31b",
    "sublabel": "bansos/gemma4:31b",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "bansos/glm-5.2",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/bansos/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "bansos/minimax-m3",
    "badge": "bansos"
  },
  {
    "value": "adit-9router/ds/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "ds/deepseek-v4-pro",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-v4-pro-max",
    "label": "deepseek-v4-pro-max",
    "sublabel": "ds/deepseek-v4-pro-max",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-v4-pro-none",
    "label": "deepseek-v4-pro-none",
    "sublabel": "ds/deepseek-v4-pro-none",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-v4.1-flash",
    "label": "deepseek-v4.1-flash",
    "sublabel": "ds/deepseek-v4.1-flash",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "ds/deepseek-v4-flash",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-v4-flash-vision-exp",
    "label": "deepseek-v4-flash-vision-exp",
    "sublabel": "ds/deepseek-v4-flash-vision-exp",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-chat",
    "label": "deepseek-chat",
    "sublabel": "ds/deepseek-chat",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ds/deepseek-reasoner",
    "label": "deepseek-reasoner",
    "sublabel": "ds/deepseek-reasoner",
    "badge": "ds"
  },
  {
    "value": "adit-9router/ae/gpt-6-astra",
    "label": "gpt-6-astra",
    "sublabel": "ae/gpt-6-astra",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-6.1-sol",
    "label": "gpt-6.1-sol",
    "sublabel": "ae/gpt-6.1-sol",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "ae/gpt-6-luna",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-6-sol",
    "label": "gpt-6-sol",
    "sublabel": "ae/gpt-6-sol",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "ae/gpt-5.6-sol",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "ae/gpt-5.6-terra",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ae/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "ae/gpt-5.6-luna",
    "badge": "ae"
  },
  {
    "value": "adit-9router/ih/ag/gemini-3.6-flash-high",
    "label": "ag · gemini-3.6-flash-high",
    "sublabel": "ih/ag/gemini-3.6-flash-high",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ag/gemini-3.7-flash-high",
    "label": "ag · gemini-3.7-flash-high",
    "sublabel": "ih/ag/gemini-3.7-flash-high",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ag/gemini-3.8-flash-high",
    "label": "ag · gemini-3.8-flash-high",
    "sublabel": "ih/ag/gemini-3.8-flash-high",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ag/gemini-pro-agent",
    "label": "ag · gemini-pro-agent",
    "sublabel": "ih/ag/gemini-pro-agent",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/deepseek-v4-flash-0731",
    "label": "ali · deepseek-v4-flash-0731",
    "sublabel": "ih/ali/deepseek-v4-flash-0731",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/deepseek-v4-pro-0813",
    "label": "ali · deepseek-v4-pro-0813",
    "sublabel": "ih/ali/deepseek-v4-pro-0813",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/deepseek-v4.1-flash",
    "label": "ali · deepseek-v4.1-flash",
    "sublabel": "ih/ali/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/glm-5.2",
    "label": "ali · glm-5.2",
    "sublabel": "ih/ali/glm-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/glm-5.3",
    "label": "ali · glm-5.3",
    "sublabel": "ih/ali/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/kimi-k2.7-code",
    "label": "ali · kimi-k2.7-code",
    "sublabel": "ih/ali/kimi-k2.7-code",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/kimi-k3",
    "label": "ali · kimi-k3",
    "sublabel": "ih/ali/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/qwen3.8-flash",
    "label": "ali · qwen3.8-flash",
    "sublabel": "ih/ali/qwen3.8-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/qwen3.8-max",
    "label": "ali · qwen3.8-max",
    "sublabel": "ih/ali/qwen3.8-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/qwen3.8-max-0902",
    "label": "ali · qwen3.8-max-0902",
    "sublabel": "ih/ali/qwen3.8-max-0902",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ali/qwen3.8-omni-flash",
    "label": "ali · qwen3.8-omni-flash",
    "sublabel": "ih/ali/qwen3.8-omni-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/deepseek-v4-pro-0813",
    "label": "alicn · deepseek-v4-pro-0813",
    "sublabel": "ih/alicn/deepseek-v4-pro-0813",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/deepseek-v4.1-flash",
    "label": "alicn · deepseek-v4.1-flash",
    "sublabel": "ih/alicn/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/glm-5.2",
    "label": "alicn · glm-5.2",
    "sublabel": "ih/alicn/glm-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/glm-5.3",
    "label": "alicn · glm-5.3",
    "sublabel": "ih/alicn/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/kimi-k3",
    "label": "alicn · kimi-k3",
    "sublabel": "ih/alicn/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/qwen3.8-flash",
    "label": "alicn · qwen3.8-flash",
    "sublabel": "ih/alicn/qwen3.8-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/qwen3.8-max",
    "label": "alicn · qwen3.8-max",
    "sublabel": "ih/alicn/qwen3.8-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/alicn/qwen3.8-omni-flash",
    "label": "alicn · qwen3.8-omni-flash",
    "sublabel": "ih/alicn/qwen3.8-omni-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/claude-opus-4.6",
    "label": "cb · claude-opus-4.6",
    "sublabel": "ih/cb/claude-opus-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/claude-opus-4.7-1m",
    "label": "cb · claude-opus-4.7-1m",
    "sublabel": "ih/cb/claude-opus-4.7-1m",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/deepseek-v4.1-flash",
    "label": "cb · deepseek-v4.1-flash",
    "sublabel": "ih/cb/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gemini-2.5-flash-image",
    "label": "cb · gemini-2.5-flash-image",
    "sublabel": "ih/cb/gemini-2.5-flash-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gemini-3.0-pro-image",
    "label": "cb · gemini-3.0-pro-image",
    "sublabel": "ih/cb/gemini-3.0-pro-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gemini-3.1-flash-image",
    "label": "cb · gemini-3.1-flash-image",
    "sublabel": "ih/cb/gemini-3.1-flash-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gemini-3.1-pro",
    "label": "cb · gemini-3.1-pro",
    "sublabel": "ih/cb/gemini-3.1-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/glm-5.2",
    "label": "cb · glm-5.2",
    "sublabel": "ih/cb/glm-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/glm-5.3",
    "label": "cb · glm-5.3",
    "sublabel": "ih/cb/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-5.3-codex",
    "label": "cb · gpt-5.3-codex",
    "sublabel": "ih/cb/gpt-5.3-codex",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-5.4",
    "label": "cb · gpt-5.4",
    "sublabel": "ih/cb/gpt-5.4",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-5.5",
    "label": "cb · gpt-5.5",
    "sublabel": "ih/cb/gpt-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-5.6-luna",
    "label": "cb · gpt-5.6-luna",
    "sublabel": "ih/cb/gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-6-astra",
    "label": "cb · gpt-6-astra",
    "sublabel": "ih/cb/gpt-6-astra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-6-luna",
    "label": "cb · gpt-6-luna",
    "sublabel": "ih/cb/gpt-6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-6-sol",
    "label": "cb · gpt-6-sol",
    "sublabel": "ih/cb/gpt-6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/gpt-image-2",
    "label": "cb · gpt-image-2",
    "sublabel": "ih/cb/gpt-image-2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/grok-4.6",
    "label": "cb · grok-4.6",
    "sublabel": "ih/cb/grok-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/grok-4.7",
    "label": "cb · grok-4.7",
    "sublabel": "ih/cb/grok-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/hy4-preview",
    "label": "cb · hy4-preview",
    "sublabel": "ih/cb/hy4-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/kimi-k3",
    "label": "cb · kimi-k3",
    "sublabel": "ih/cb/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cb/minimax-m3",
    "label": "cb · minimax-m3",
    "sublabel": "ih/cb/minimax-m3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/deepseek-v4-flash",
    "label": "cbcn · deepseek-v4-flash",
    "sublabel": "ih/cbcn/deepseek-v4-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/deepseek-v4-pro",
    "label": "cbcn · deepseek-v4-pro",
    "sublabel": "ih/cbcn/deepseek-v4-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/deepseek-v4.1-flash",
    "label": "cbcn · deepseek-v4.1-flash",
    "sublabel": "ih/cbcn/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/glm-5.2",
    "label": "cbcn · glm-5.2",
    "sublabel": "ih/cbcn/glm-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/glm-5.3",
    "label": "cbcn · glm-5.3",
    "sublabel": "ih/cbcn/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/glm-5.3-flash",
    "label": "cbcn · glm-5.3-flash",
    "sublabel": "ih/cbcn/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/hy4-preview",
    "label": "cbcn · hy4-preview",
    "sublabel": "ih/cbcn/hy4-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/kimi-k2.6",
    "label": "cbcn · kimi-k2.6",
    "sublabel": "ih/cbcn/kimi-k2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/kimi-k2.7",
    "label": "cbcn · kimi-k2.7",
    "sublabel": "ih/cbcn/kimi-k2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/kimi-k3",
    "label": "cbcn · kimi-k3",
    "sublabel": "ih/cbcn/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/minimax-m2.7",
    "label": "cbcn · minimax-m2.7",
    "sublabel": "ih/cbcn/minimax-m2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cbcn/minimax-m3",
    "label": "cbcn · minimax-m3",
    "sublabel": "ih/cbcn/minimax-m3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-fable-5",
    "label": "cc · claude-fable-5",
    "sublabel": "ih/cc/claude-fable-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-fable-5-1",
    "label": "cc · claude-fable-5-1",
    "sublabel": "ih/cc/claude-fable-5-1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-haiku-4-5",
    "label": "cc · claude-haiku-4-5",
    "sublabel": "ih/cc/claude-haiku-4-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-opus-4-6",
    "label": "cc · claude-opus-4-6",
    "sublabel": "ih/cc/claude-opus-4-6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-opus-4-7",
    "label": "cc · claude-opus-4-7",
    "sublabel": "ih/cc/claude-opus-4-7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-opus-4-8",
    "label": "cc · claude-opus-4-8",
    "sublabel": "ih/cc/claude-opus-4-8",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-opus-5",
    "label": "cc · claude-opus-5",
    "sublabel": "ih/cc/claude-opus-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-opus-5-5",
    "label": "cc · claude-opus-5-5",
    "sublabel": "ih/cc/claude-opus-5-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-sonnet-4-6",
    "label": "cc · claude-sonnet-4-6",
    "sublabel": "ih/cc/claude-sonnet-4-6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-sonnet-5",
    "label": "cc · claude-sonnet-5",
    "sublabel": "ih/cc/claude-sonnet-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cc/claude-sonnet-5-5",
    "label": "cc · claude-sonnet-5-5",
    "sublabel": "ih/cc/claude-sonnet-5-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/MiniMaxAI/MiniMax-M2.7",
    "label": "cmc · MiniMaxAI · MiniMax-M2.7",
    "sublabel": "ih/cmc/MiniMaxAI/MiniMax-M2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/Qwen/Qwen3.6-Max-Preview",
    "label": "cmc · Qwen · Qwen3.6-Max-Preview",
    "sublabel": "ih/cmc/Qwen/Qwen3.6-Max-Preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/deepseek/deepseek-v4-flash",
    "label": "cmc · deepseek · deepseek-v4-flash",
    "sublabel": "ih/cmc/deepseek/deepseek-v4-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/deepseek/deepseek-v4-pro",
    "label": "cmc · deepseek · deepseek-v4-pro",
    "sublabel": "ih/cmc/deepseek/deepseek-v4-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/deepseek/deepseek-v4.1-flash",
    "label": "cmc · deepseek · deepseek-v4.1-flash",
    "sublabel": "ih/cmc/deepseek/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/deepseek/deepseek-v4.1-flash-fast",
    "label": "cmc · deepseek · deepseek-v4.1-flash-fast",
    "sublabel": "ih/cmc/deepseek/deepseek-v4.1-flash-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/meta/muse-spark-1.2",
    "label": "cmc · meta · muse-spark-1.2",
    "sublabel": "ih/cmc/meta/muse-spark-1.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/meta/muse-spark-1.2-contributor",
    "label": "cmc · meta · muse-spark-1.2-contributor",
    "sublabel": "ih/cmc/meta/muse-spark-1.2-contributor",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/meta/muse-spark-1.3",
    "label": "cmc · meta · muse-spark-1.3",
    "sublabel": "ih/cmc/meta/muse-spark-1.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/meta/muse-spark-1.3-contributor",
    "label": "cmc · meta · muse-spark-1.3-contributor",
    "sublabel": "ih/cmc/meta/muse-spark-1.3-contributor",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/moonshotai/Kimi-K2.6",
    "label": "cmc · moonshotai · Kimi-K2.6",
    "sublabel": "ih/cmc/moonshotai/Kimi-K2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/moonshotai/Kimi-K2.7-Code",
    "label": "cmc · moonshotai · Kimi-K2.7-Code",
    "sublabel": "ih/cmc/moonshotai/Kimi-K2.7-Code",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/moonshotai/Kimi-K3",
    "label": "cmc · moonshotai · Kimi-K3",
    "sublabel": "ih/cmc/moonshotai/Kimi-K3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xai/grok-4.5",
    "label": "cmc · xai · grok-4.5",
    "sublabel": "ih/cmc/xai/grok-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xai/grok-4.6",
    "label": "cmc · xai · grok-4.6",
    "sublabel": "ih/cmc/xai/grok-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xai/grok-4.7",
    "label": "cmc · xai · grok-4.7",
    "sublabel": "ih/cmc/xai/grok-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xiaomi/mimo-v2.5",
    "label": "cmc · xiaomi · mimo-v2.5",
    "sublabel": "ih/cmc/xiaomi/mimo-v2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xiaomi/mimo-v2.5-pro",
    "label": "cmc · xiaomi · mimo-v2.5-pro",
    "sublabel": "ih/cmc/xiaomi/mimo-v2.5-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xiaomi/mimo-v2.6-flash",
    "label": "cmc · xiaomi · mimo-v2.6-flash",
    "sublabel": "ih/cmc/xiaomi/mimo-v2.6-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/xiaomi/mimo-v2.6-pro",
    "label": "cmc · xiaomi · mimo-v2.6-pro",
    "sublabel": "ih/cmc/xiaomi/mimo-v2.6-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/z-ai/glm-5.3-flashx",
    "label": "cmc · z-ai · glm-5.3-flashx",
    "sublabel": "ih/cmc/z-ai/glm-5.3-flashx",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/zai-org/GLM-5.1",
    "label": "cmc · zai-org · GLM-5.1",
    "sublabel": "ih/cmc/zai-org/GLM-5.1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cmc/zai-org/GLM-5.2",
    "label": "cmc · zai-org · GLM-5.2",
    "sublabel": "ih/cmc/zai-org/GLM-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/deepseek-v4-pro",
    "label": "cp · cline-pass · deepseek-v4-pro",
    "sublabel": "ih/cp/cline-pass/deepseek-v4-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/deepseek-v4.1-flash",
    "label": "cp · cline-pass · deepseek-v4.1-flash",
    "sublabel": "ih/cp/cline-pass/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/glm-5.3",
    "label": "cp · cline-pass · glm-5.3",
    "sublabel": "ih/cp/cline-pass/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/glm-5.3-flash",
    "label": "cp · cline-pass · glm-5.3-flash",
    "sublabel": "ih/cp/cline-pass/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/kimi-k3",
    "label": "cp · cline-pass · kimi-k3",
    "sublabel": "ih/cp/cline-pass/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/mimo-v2.5",
    "label": "cp · cline-pass · mimo-v2.5",
    "sublabel": "ih/cp/cline-pass/mimo-v2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/mimo-v2.5-pro",
    "label": "cp · cline-pass · mimo-v2.5-pro",
    "sublabel": "ih/cp/cline-pass/mimo-v2.5-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/mimo-v2.6-flash",
    "label": "cp · cline-pass · mimo-v2.6-flash",
    "sublabel": "ih/cp/cline-pass/mimo-v2.6-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/mimo-v2.6-pro",
    "label": "cp · cline-pass · mimo-v2.6-pro",
    "sublabel": "ih/cp/cline-pass/mimo-v2.6-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/minimax-m3",
    "label": "cp · cline-pass · minimax-m3",
    "sublabel": "ih/cp/cline-pass/minimax-m3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/qwen3.7-max",
    "label": "cp · cline-pass · qwen3.7-max",
    "sublabel": "ih/cp/cline-pass/qwen3.7-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/qwen3.7-plus",
    "label": "cp · cline-pass · qwen3.7-plus",
    "sublabel": "ih/cp/cline-pass/qwen3.7-plus",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/cline-pass/qwen3.8-max",
    "label": "cp · cline-pass · qwen3.8-max",
    "sublabel": "ih/cp/cline-pass/qwen3.8-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/xai/grok-4.5",
    "label": "cp · xai · grok-4.5",
    "sublabel": "ih/cp/xai/grok-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/xai/grok-4.6",
    "label": "cp · xai · grok-4.6",
    "sublabel": "ih/cp/xai/grok-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/xai/grok-4.7",
    "label": "cp · xai · grok-4.7",
    "sublabel": "ih/cp/xai/grok-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cp/zai/glm-5.3-flash",
    "label": "cp · zai · glm-5.3-flash",
    "sublabel": "ih/cp/zai/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-5.5",
    "label": "cx · gpt-5.5",
    "sublabel": "ih/cx/gpt-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-5.6-luna",
    "label": "cx · gpt-5.6-luna",
    "sublabel": "ih/cx/gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-5.6-sol",
    "label": "cx · gpt-5.6-sol",
    "sublabel": "ih/cx/gpt-5.6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-5.6-terra",
    "label": "cx · gpt-5.6-terra",
    "sublabel": "ih/cx/gpt-5.6-terra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-6-astra",
    "label": "cx · gpt-6-astra",
    "sublabel": "ih/cx/gpt-6-astra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-6-luna",
    "label": "cx · gpt-6-luna",
    "sublabel": "ih/cx/gpt-6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-6-sol",
    "label": "cx · gpt-6-sol",
    "sublabel": "ih/cx/gpt-6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/cx/gpt-6.1-sol",
    "label": "cx · gpt-6.1-sol",
    "sublabel": "ih/cx/gpt-6.1-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok/grok-4.6",
    "label": "grok · grok-4.6",
    "sublabel": "ih/grok/grok-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok/grok-4.7",
    "label": "grok · grok-4.7",
    "sublabel": "ih/grok/grok-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kc/k3",
    "label": "kc · k3",
    "sublabel": "ih/kc/k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kc/k3-256k",
    "label": "kc · k3-256k",
    "sublabel": "ih/kc/k3-256k",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kc/kimi-for-coding",
    "label": "kc · kimi-for-coding",
    "sublabel": "ih/kc/kimi-for-coding",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kc/kimi-for-coding-highspeed",
    "label": "kc · kimi-for-coding-highspeed",
    "sublabel": "ih/kc/kimi-for-coding-highspeed",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kcai/k3",
    "label": "kcai · k3",
    "sublabel": "ih/kcai/k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kcai/k3-256k",
    "label": "kcai · k3-256k",
    "sublabel": "ih/kcai/k3-256k",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kcai/kimi-for-coding",
    "label": "kcai · kimi-for-coding",
    "sublabel": "ih/kcai/kimi-for-coding",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kcai/kimi-for-coding-highspeed",
    "label": "kcai · kimi-for-coding-highspeed",
    "sublabel": "ih/kcai/kimi-for-coding-highspeed",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-haiku-4.5",
    "label": "kiro · claude-haiku-4.5",
    "sublabel": "ih/kiro/claude-haiku-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-opus-4.8",
    "label": "kiro · claude-opus-4.8",
    "sublabel": "ih/kiro/claude-opus-4.8",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-opus-5",
    "label": "kiro · claude-opus-5",
    "sublabel": "ih/kiro/claude-opus-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-opus-5.5",
    "label": "kiro · claude-opus-5.5",
    "sublabel": "ih/kiro/claude-opus-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-sonnet-4.6",
    "label": "kiro · claude-sonnet-4.6",
    "sublabel": "ih/kiro/claude-sonnet-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-sonnet-5",
    "label": "kiro · claude-sonnet-5",
    "sublabel": "ih/kiro/claude-sonnet-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/claude-sonnet-5.5",
    "label": "kiro · claude-sonnet-5.5",
    "sublabel": "ih/kiro/claude-sonnet-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/deepseek-3.2",
    "label": "kiro · deepseek-3.2",
    "sublabel": "ih/kiro/deepseek-3.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/glm-5",
    "label": "kiro · glm-5",
    "sublabel": "ih/kiro/glm-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/gpt-5.6-luna",
    "label": "kiro · gpt-5.6-luna",
    "sublabel": "ih/kiro/gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/gpt-5.6-sol",
    "label": "kiro · gpt-5.6-sol",
    "sublabel": "ih/kiro/gpt-5.6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/gpt-5.6-terra",
    "label": "kiro · gpt-5.6-terra",
    "sublabel": "ih/kiro/gpt-5.6-terra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/minimax-m2.5",
    "label": "kiro · minimax-m2.5",
    "sublabel": "ih/kiro/minimax-m2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro/qwen3-coder-next",
    "label": "kiro · qwen3-coder-next",
    "sublabel": "ih/kiro/qwen3-coder-next",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo/mimo-v2.5",
    "label": "mimo · mimo-v2.5",
    "sublabel": "ih/mimo/mimo-v2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo/mimo-v2.5-pro",
    "label": "mimo · mimo-v2.5-pro",
    "sublabel": "ih/mimo/mimo-v2.5-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mm/MiniMax-M2.5",
    "label": "mm · MiniMax-M2.5",
    "sublabel": "ih/mm/MiniMax-M2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mm/MiniMax-M2.7",
    "label": "mm · MiniMax-M2.7",
    "sublabel": "ih/mm/MiniMax-M2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mm/MiniMax-M3",
    "label": "mm · MiniMax-M3",
    "sublabel": "ih/mm/MiniMax-M3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mm/MiniMax-M3.1-Flash-Preview",
    "label": "mm · MiniMax-M3.1-Flash-Preview",
    "sublabel": "ih/mm/MiniMax-M3.1-Flash-Preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mmcn/MiniMax-M2.5",
    "label": "mmcn · MiniMax-M2.5",
    "sublabel": "ih/mmcn/MiniMax-M2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mmcn/MiniMax-M2.7",
    "label": "mmcn · MiniMax-M2.7",
    "sublabel": "ih/mmcn/MiniMax-M2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mmcn/MiniMax-M3",
    "label": "mmcn · MiniMax-M3",
    "sublabel": "ih/mmcn/MiniMax-M3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mmcn/MiniMax-M3.1-Flash-Preview",
    "label": "mmcn · MiniMax-M3.1-Flash-Preview",
    "sublabel": "ih/mmcn/MiniMax-M3.1-Flash-Preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/deepseek-v4-flash",
    "label": "ocg · deepseek-v4-flash",
    "sublabel": "ih/ocg/deepseek-v4-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/deepseek-v4.1-flash",
    "label": "ocg · deepseek-v4.1-flash",
    "sublabel": "ih/ocg/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/glm-5.3",
    "label": "ocg · glm-5.3",
    "sublabel": "ih/ocg/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/glm-5.3-flash",
    "label": "ocg · glm-5.3-flash",
    "sublabel": "ih/ocg/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/gpt-5.6-luna",
    "label": "ocg · gpt-5.6-luna",
    "sublabel": "ih/ocg/gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/grok-4.5",
    "label": "ocg · grok-4.5",
    "sublabel": "ih/ocg/grok-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/hy4-preview",
    "label": "ocg · hy4-preview",
    "sublabel": "ih/ocg/hy4-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/kimi-k2.6",
    "label": "ocg · kimi-k2.6",
    "sublabel": "ih/ocg/kimi-k2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/kimi-k2.7-code",
    "label": "ocg · kimi-k2.7-code",
    "sublabel": "ih/ocg/kimi-k2.7-code",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/kimi-k3",
    "label": "ocg · kimi-k3",
    "sublabel": "ih/ocg/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/mimo-v2.5",
    "label": "ocg · mimo-v2.5",
    "sublabel": "ih/ocg/mimo-v2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/mimo-v2.5-pro",
    "label": "ocg · mimo-v2.5-pro",
    "sublabel": "ih/ocg/mimo-v2.5-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/mimo-v2.6-flash",
    "label": "ocg · mimo-v2.6-flash",
    "sublabel": "ih/ocg/mimo-v2.6-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/mimo-v2.6-pro",
    "label": "ocg · mimo-v2.6-pro",
    "sublabel": "ih/ocg/mimo-v2.6-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/minimax-m2.5",
    "label": "ocg · minimax-m2.5",
    "sublabel": "ih/ocg/minimax-m2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/minimax-m2.7",
    "label": "ocg · minimax-m2.7",
    "sublabel": "ih/ocg/minimax-m2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/minimax-m3",
    "label": "ocg · minimax-m3",
    "sublabel": "ih/ocg/minimax-m3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/qwen3.7-plus",
    "label": "ocg · qwen3.7-plus",
    "sublabel": "ih/ocg/qwen3.7-plus",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/qwen3.8-flash",
    "label": "ocg · qwen3.8-flash",
    "sublabel": "ih/ocg/qwen3.8-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ocg/qwen3.8-max",
    "label": "ocg · qwen3.8-max",
    "sublabel": "ih/ocg/qwen3.8-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/zai/glm-4.6v",
    "label": "zai · glm-4.6v",
    "sublabel": "ih/zai/glm-4.6v",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/zai/glm-5.3",
    "label": "zai · glm-5.3",
    "sublabel": "ih/zai/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/zai/glm-5.3-flash",
    "label": "zai · glm-5.3-flash",
    "sublabel": "ih/zai/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/anime-xl",
    "label": "anime-xl",
    "sublabel": "ih/anime-xl",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-fable-5",
    "label": "claude-fable-5",
    "sublabel": "ih/claude-fable-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-fable-5.1",
    "label": "claude-fable-5.1",
    "sublabel": "ih/claude-fable-5.1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-haiku-4.5",
    "label": "claude-haiku-4.5",
    "sublabel": "ih/claude-haiku-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-4.6",
    "label": "claude-opus-4.6",
    "sublabel": "ih/claude-opus-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-4.6-thinking",
    "label": "claude-opus-4.6-thinking",
    "sublabel": "ih/claude-opus-4.6-thinking",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-4.7",
    "label": "claude-opus-4.7",
    "sublabel": "ih/claude-opus-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-4.8",
    "label": "claude-opus-4.8",
    "sublabel": "ih/claude-opus-4.8",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-5",
    "label": "claude-opus-5",
    "sublabel": "ih/claude-opus-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-opus-5.5",
    "label": "claude-opus-5.5",
    "sublabel": "ih/claude-opus-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-sonnet-4.5",
    "label": "claude-sonnet-4.5",
    "sublabel": "ih/claude-sonnet-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-sonnet-4.6",
    "label": "claude-sonnet-4.6",
    "sublabel": "ih/claude-sonnet-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-sonnet-5",
    "label": "claude-sonnet-5",
    "sublabel": "ih/claude-sonnet-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/claude-sonnet-5.5",
    "label": "claude-sonnet-5.5",
    "sublabel": "ih/claude-sonnet-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/composer-2.5",
    "label": "composer-2.5",
    "sublabel": "ih/composer-2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/concept-art",
    "label": "concept-art",
    "sublabel": "ih/concept-art",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/deepseek-v4-flash",
    "label": "deepseek-v4-flash",
    "sublabel": "ih/deepseek-v4-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/deepseek-v4-pro",
    "label": "deepseek-v4-pro",
    "sublabel": "ih/deepseek-v4-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/deepseek-v4.1-flash",
    "label": "deepseek-v4.1-flash",
    "sublabel": "ih/deepseek-v4.1-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/deepseek-v4.1-flash-fast",
    "label": "deepseek-v4.1-flash-fast",
    "sublabel": "ih/deepseek-v4.1-flash-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-3-video",
    "label": "flux-3-video",
    "sublabel": "ih/flux-3-video",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-dev",
    "label": "flux-dev",
    "sublabel": "ih/flux-dev",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-kontext-max",
    "label": "flux-kontext-max",
    "sublabel": "ih/flux-kontext-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-kontext-pro",
    "label": "flux-kontext-pro",
    "sublabel": "ih/flux-kontext-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-pro-2.0",
    "label": "flux-pro-2.0",
    "sublabel": "ih/flux-pro-2.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/flux-schnell",
    "label": "flux-schnell",
    "sublabel": "ih/flux-schnell",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-2.5-flash-image",
    "label": "gemini-2.5-flash-image",
    "sublabel": "ih/gemini-2.5-flash-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-2.5-flash-image-microusd",
    "label": "gemini-2.5-flash-image-microusd",
    "sublabel": "ih/gemini-2.5-flash-image-microusd",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.0-pro-image",
    "label": "gemini-3.0-pro-image",
    "sublabel": "ih/gemini-3.0-pro-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.1-flash-image",
    "label": "gemini-3.1-flash-image",
    "sublabel": "ih/gemini-3.1-flash-image",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.1-pro",
    "label": "gemini-3.1-pro",
    "sublabel": "ih/gemini-3.1-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.1-pro-high",
    "label": "gemini-3.1-pro-high",
    "sublabel": "ih/gemini-3.1-pro-high",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.6-flash",
    "label": "gemini-3.6-flash",
    "sublabel": "ih/gemini-3.6-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.7-flash",
    "label": "gemini-3.7-flash",
    "sublabel": "ih/gemini-3.7-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-3.8-flash",
    "label": "gemini-3.8-flash",
    "sublabel": "ih/gemini-3.8-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-image-2",
    "label": "gemini-image-2",
    "sublabel": "ih/gemini-image-2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-omni-1.1-flash-preview",
    "label": "gemini-omni-1.1-flash-preview",
    "sublabel": "ih/gemini-omni-1.1-flash-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gemini-omni-flash",
    "label": "gemini-omni-flash",
    "sublabel": "ih/gemini-omni-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-4.6v",
    "label": "glm-4.6v",
    "sublabel": "ih/glm-4.6v",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-4.7",
    "label": "glm-4.7",
    "sublabel": "ih/glm-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5",
    "label": "glm-5",
    "sublabel": "ih/glm-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5-turbo",
    "label": "glm-5-turbo",
    "sublabel": "ih/glm-5-turbo",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5.1",
    "label": "glm-5.1",
    "sublabel": "ih/glm-5.1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5.2",
    "label": "glm-5.2",
    "sublabel": "ih/glm-5.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5.3",
    "label": "glm-5.3",
    "sublabel": "ih/glm-5.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5.3-flash",
    "label": "glm-5.3-flash",
    "sublabel": "ih/glm-5.3-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/glm-5.3-flashx",
    "label": "glm-5.3-flashx",
    "sublabel": "ih/glm-5.3-flashx",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.3-codex",
    "label": "gpt-5.3-codex",
    "sublabel": "ih/gpt-5.3-codex",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.4",
    "label": "gpt-5.4",
    "sublabel": "ih/gpt-5.4",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.4-mini",
    "label": "gpt-5.4-mini",
    "sublabel": "ih/gpt-5.4-mini",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.5",
    "label": "gpt-5.5",
    "sublabel": "ih/gpt-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.6-luna",
    "label": "gpt-5.6-luna",
    "sublabel": "ih/gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.6-sol",
    "label": "gpt-5.6-sol",
    "sublabel": "ih/gpt-5.6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-5.6-terra",
    "label": "gpt-5.6-terra",
    "sublabel": "ih/gpt-5.6-terra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-6-astra",
    "label": "gpt-6-astra",
    "sublabel": "ih/gpt-6-astra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-6-luna",
    "label": "gpt-6-luna",
    "sublabel": "ih/gpt-6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-6-sol",
    "label": "gpt-6-sol",
    "sublabel": "ih/gpt-6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-6.1-sol",
    "label": "gpt-6.1-sol",
    "sublabel": "ih/gpt-6.1-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-image-1.5",
    "label": "gpt-image-1.5",
    "sublabel": "ih/gpt-image-1.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-image-2",
    "label": "gpt-image-2",
    "sublabel": "ih/gpt-image-2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-image-2-microusd",
    "label": "gpt-image-2-microusd",
    "sublabel": "ih/gpt-image-2-microusd",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-image-2.5-flare",
    "label": "gpt-image-2.5-flare",
    "sublabel": "ih/gpt-image-2.5-flare",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/gpt-image-2.5-sunburst",
    "label": "gpt-image-2.5-sunburst",
    "sublabel": "ih/gpt-image-2.5-sunburst",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/graphic-design",
    "label": "graphic-design",
    "sublabel": "ih/graphic-design",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok-4.5",
    "label": "grok-4.5",
    "sublabel": "ih/grok-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok-4.6",
    "label": "grok-4.6",
    "sublabel": "ih/grok-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok-4.7",
    "label": "grok-4.7",
    "sublabel": "ih/grok-4.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/grok-imagine-1.5",
    "label": "grok-imagine-1.5",
    "sublabel": "ih/grok-imagine-1.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/hailuo-03",
    "label": "hailuo-03",
    "sublabel": "ih/hailuo-03",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/hailuo-2_3",
    "label": "hailuo-2_3",
    "sublabel": "ih/hailuo-2_3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/hailuo-2_3-fast",
    "label": "hailuo-2_3-fast",
    "sublabel": "ih/hailuo-2_3-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/happy-horse",
    "label": "happy-horse",
    "sublabel": "ih/happy-horse",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/happy-horse-1.1",
    "label": "happy-horse-1.1",
    "sublabel": "ih/happy-horse-1.1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/hy3",
    "label": "hy3",
    "sublabel": "ih/hy3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/hy4-preview",
    "label": "hy4-preview",
    "sublabel": "ih/hy4-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ideogram-v3.0",
    "label": "ideogram-v3.0",
    "sublabel": "ih/ideogram-v3.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ideogram-v4.0",
    "label": "ideogram-v4.0",
    "sublabel": "ih/ideogram-v4.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/illustrative-albedo",
    "label": "illustrative-albedo",
    "sublabel": "ih/illustrative-albedo",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-for-coding",
    "label": "kimi-for-coding",
    "sublabel": "ih/kimi-for-coding",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-for-coding-highspeed",
    "label": "kimi-for-coding-highspeed",
    "sublabel": "ih/kimi-for-coding-highspeed",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k2.5",
    "label": "kimi-k2.5",
    "sublabel": "ih/kimi-k2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k2.6",
    "label": "kimi-k2.6",
    "sublabel": "ih/kimi-k2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k2.7",
    "label": "kimi-k2.7",
    "sublabel": "ih/kimi-k2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k2.7-code",
    "label": "kimi-k2.7-code",
    "sublabel": "ih/kimi-k2.7-code",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k2.7-code-highspeed",
    "label": "kimi-k2.7-code-highspeed",
    "sublabel": "ih/kimi-k2.7-code-highspeed",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kimi-k3",
    "label": "kimi-k3",
    "sublabel": "ih/kimi-k3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kino-xl",
    "label": "kino-xl",
    "sublabel": "ih/kino-xl",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-deepseek-3.2",
    "label": "kiro-deepseek-3.2",
    "sublabel": "ih/kiro-deepseek-3.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-glm-5",
    "label": "kiro-glm-5",
    "sublabel": "ih/kiro-glm-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-gpt-5.6",
    "label": "kiro-gpt-5.6",
    "sublabel": "ih/kiro-gpt-5.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-gpt-5.6-luna",
    "label": "kiro-gpt-5.6-luna",
    "sublabel": "ih/kiro-gpt-5.6-luna",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-gpt-5.6-sol",
    "label": "kiro-gpt-5.6-sol",
    "sublabel": "ih/kiro-gpt-5.6-sol",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-gpt-5.6-terra",
    "label": "kiro-gpt-5.6-terra",
    "sublabel": "ih/kiro-gpt-5.6-terra",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-haiku-4.5",
    "label": "kiro-haiku-4.5",
    "sublabel": "ih/kiro-haiku-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-minimax-m2.5",
    "label": "kiro-minimax-m2.5",
    "sublabel": "ih/kiro-minimax-m2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-opus-4.8",
    "label": "kiro-opus-4.8",
    "sublabel": "ih/kiro-opus-4.8",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-opus-5",
    "label": "kiro-opus-5",
    "sublabel": "ih/kiro-opus-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-opus-5.5",
    "label": "kiro-opus-5.5",
    "sublabel": "ih/kiro-opus-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-qwen3-coder-next",
    "label": "kiro-qwen3-coder-next",
    "sublabel": "ih/kiro-qwen3-coder-next",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-sonnet-4.5",
    "label": "kiro-sonnet-4.5",
    "sublabel": "ih/kiro-sonnet-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-sonnet-4.6",
    "label": "kiro-sonnet-4.6",
    "sublabel": "ih/kiro-sonnet-4.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-sonnet-5",
    "label": "kiro-sonnet-5",
    "sublabel": "ih/kiro-sonnet-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kiro-sonnet-5.5",
    "label": "kiro-sonnet-5.5",
    "sublabel": "ih/kiro-sonnet-5.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-2.1",
    "label": "kling-2.1",
    "sublabel": "ih/kling-2.1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-2.5",
    "label": "kling-2.5",
    "sublabel": "ih/kling-2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-2.5-turbo-standard",
    "label": "kling-2.5-turbo-standard",
    "sublabel": "ih/kling-2.5-turbo-standard",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-2.6",
    "label": "kling-2.6",
    "sublabel": "ih/kling-2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-3.0",
    "label": "kling-3.0",
    "sublabel": "ih/kling-3.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-3.0-turbo",
    "label": "kling-3.0-turbo",
    "sublabel": "ih/kling-3.0-turbo",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-video-o-1",
    "label": "kling-video-o-1",
    "sublabel": "ih/kling-video-o-1",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/kling-video-o-3",
    "label": "kling-video-o-3",
    "sublabel": "ih/kling-video-o-3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/krea-2",
    "label": "krea-2",
    "sublabel": "ih/krea-2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/krea-2-turbo",
    "label": "krea-2-turbo",
    "sublabel": "ih/krea-2-turbo",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/lifelike-vision",
    "label": "lifelike-vision",
    "sublabel": "ih/lifelike-vision",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/lightning-xl",
    "label": "lightning-xl",
    "sublabel": "ih/lightning-xl",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ltxv-2.3-fast",
    "label": "ltxv-2.3-fast",
    "sublabel": "ih/ltxv-2.3-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ltxv-2.3-pro",
    "label": "ltxv-2.3-pro",
    "sublabel": "ih/ltxv-2.3-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/lucid-origin",
    "label": "lucid-origin",
    "sublabel": "ih/lucid-origin",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/lucid-realism",
    "label": "lucid-realism",
    "sublabel": "ih/lucid-realism",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo-v2.5",
    "label": "mimo-v2.5",
    "sublabel": "ih/mimo-v2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo-v2.5-pro",
    "label": "mimo-v2.5-pro",
    "sublabel": "ih/mimo-v2.5-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo-v2.6-flash",
    "label": "mimo-v2.6-flash",
    "sublabel": "ih/mimo-v2.6-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/mimo-v2.6-pro",
    "label": "mimo-v2.6-pro",
    "sublabel": "ih/mimo-v2.6-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/minimax-m2.5",
    "label": "minimax-m2.5",
    "sublabel": "ih/minimax-m2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/minimax-m2.7",
    "label": "minimax-m2.7",
    "sublabel": "ih/minimax-m2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/minimax-m3",
    "label": "minimax-m3",
    "sublabel": "ih/minimax-m3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/minimax-m3.1-flash-preview",
    "label": "minimax-m3.1-flash-preview",
    "sublabel": "ih/minimax-m3.1-flash-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/motion_2.0",
    "label": "motion_2.0",
    "sublabel": "ih/motion_2.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/motion_2.0-fast",
    "label": "motion_2.0-fast",
    "sublabel": "ih/motion_2.0-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/muse-spark-1.2",
    "label": "muse-spark-1.2",
    "sublabel": "ih/muse-spark-1.2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/muse-spark-1.2-contributor",
    "label": "muse-spark-1.2-contributor",
    "sublabel": "ih/muse-spark-1.2-contributor",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/muse-spark-1.3",
    "label": "muse-spark-1.3",
    "sublabel": "ih/muse-spark-1.3",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/muse-spark-1.3-contributor",
    "label": "muse-spark-1.3-contributor",
    "sublabel": "ih/muse-spark-1.3-contributor",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/nano-banana-2",
    "label": "nano-banana-2",
    "sublabel": "ih/nano-banana-2",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/nano-banana-2-lite",
    "label": "nano-banana-2-lite",
    "sublabel": "ih/nano-banana-2-lite",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/p-image-ideogram",
    "label": "p-image-ideogram",
    "sublabel": "ih/p-image-ideogram",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/phoenix-v0.9",
    "label": "phoenix-v0.9",
    "sublabel": "ih/phoenix-v0.9",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/phoenix-v1.0",
    "label": "phoenix-v1.0",
    "sublabel": "ih/phoenix-v1.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/portrait-perfect",
    "label": "portrait-perfect",
    "sublabel": "ih/portrait-perfect",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.6-max-preview",
    "label": "qwen3.6-max-preview",
    "sublabel": "ih/qwen3.6-max-preview",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.6-plus",
    "label": "qwen3.6-plus",
    "sublabel": "ih/qwen3.6-plus",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.7-max",
    "label": "qwen3.7-max",
    "sublabel": "ih/qwen3.7-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.7-plus",
    "label": "qwen3.7-plus",
    "sublabel": "ih/qwen3.7-plus",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.8-flash",
    "label": "qwen3.8-flash",
    "sublabel": "ih/qwen3.8-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.8-max",
    "label": "qwen3.8-max",
    "sublabel": "ih/qwen3.8-max",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.8-max-0902",
    "label": "qwen3.8-max-0902",
    "sublabel": "ih/qwen3.8-max-0902",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/qwen3.8-omni-flash",
    "label": "qwen3.8-omni-flash",
    "sublabel": "ih/qwen3.8-omni-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/recraft-v4",
    "label": "recraft-v4",
    "sublabel": "ih/recraft-v4",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/recraft-v4-pro",
    "label": "recraft-v4-pro",
    "sublabel": "ih/recraft-v4-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-1.0-pro",
    "label": "seedance-1.0-pro",
    "sublabel": "ih/seedance-1.0-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-1.0-pro-fast",
    "label": "seedance-1.0-pro-fast",
    "sublabel": "ih/seedance-1.0-pro-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-2.0",
    "label": "seedance-2.0",
    "sublabel": "ih/seedance-2.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-2.0-fast",
    "label": "seedance-2.0-fast",
    "sublabel": "ih/seedance-2.0-fast",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-2.0-mini",
    "label": "seedance-2.0-mini",
    "sublabel": "ih/seedance-2.0-mini",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedance-2.5",
    "label": "seedance-2.5",
    "sublabel": "ih/seedance-2.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedream-4.0",
    "label": "seedream-4.0",
    "sublabel": "ih/seedream-4.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedream-4.5",
    "label": "seedream-4.5",
    "sublabel": "ih/seedream-4.5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/seedream-5.0-pro",
    "label": "seedream-5.0-pro",
    "sublabel": "ih/seedream-5.0-pro",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/step-3.5-flash",
    "label": "step-3.5-flash",
    "sublabel": "ih/step-3.5-flash",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/stock-photography",
    "label": "stock-photography",
    "sublabel": "ih/stock-photography",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/veo-3.1-fast-generate-001",
    "label": "veo-3.1-fast-generate-001",
    "sublabel": "ih/veo-3.1-fast-generate-001",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/veo-3.1-generate-001",
    "label": "veo-3.1-generate-001",
    "sublabel": "ih/veo-3.1-generate-001",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/veo-3.1-lite",
    "label": "veo-3.1-lite",
    "sublabel": "ih/veo-3.1-lite",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/wan-2.6",
    "label": "wan-2.6",
    "sublabel": "ih/wan-2.6",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/wan-2.7",
    "label": "wan-2.7",
    "sublabel": "ih/wan-2.7",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/wan-3.0",
    "label": "wan-3.0",
    "sublabel": "ih/wan-3.0",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ag/claude-opus-5-5",
    "label": "ag · claude-opus-5-5",
    "sublabel": "ih/ag/claude-opus-5-5",
    "badge": "ih"
  },
  {
    "value": "adit-9router/ih/ag/claude-sonnet-5-5",
    "label": "ag · claude-sonnet-5-5",
    "sublabel": "ih/ag/claude-sonnet-5-5",
    "badge": "ih"
  }
]

export const FALLBACK_COMMANDCODE_MODELS: SearchSelectOption[] = [
  {
    "value": "deepseek/deepseek-v4-pro",
    "label": "Deepseek V4 Pro",
    "sublabel": "hybrid-attention long-context reasoning"
  },
  {
    "value": "deepseek/deepseek-v4-flash",
    "label": "Deepseek V4 Flash",
    "sublabel": "fast hybrid-attention reasoning (default)",
    "badge": "default"
  },
  {
    "value": "deepseek/deepseek-v4-flash-vision-exp",
    "label": "Deepseek V4 Flash Vision Exp",
    "sublabel": "fast hybrid-attention reasoning with vision",
    "badge": "fast"
  },
  {
    "value": "deepseek/deepseek-v4-flash-fast",
    "label": "Deepseek V4 Flash Fast",
    "sublabel": "low-latency V4 Flash deployment"
  },
  {
    "value": "deepseek/deepseek-v4.1-flash",
    "label": "Deepseek V4.1 Flash",
    "sublabel": "V4.1 hybrid-attention reasoning with vision"
  },
  {
    "value": "deepseek/deepseek-v4.1-flash-fast",
    "label": "Deepseek V4.1 Flash Fast",
    "sublabel": "High throughput V4.1 Flash"
  },
  {
    "value": "moonshotai/kimi-k3.1-pro",
    "label": "Kimi K3.1 Pro",
    "sublabel": "frontier reasoning & agentic coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "moonshotai/kimi-k3",
    "label": "Kimi K3",
    "sublabel": "long-horizon coding & knowledge work with 1M context",
    "badge": "1M context"
  },
  {
    "value": "moonshotai/kimi-k2.7-code",
    "label": "Kimi K2.7 Code",
    "sublabel": "improved long-horizon coding with vision"
  },
  {
    "value": "moonshotai/kimi-k2.7-code-highspeed",
    "label": "Kimi K2.7 Code Highspeed",
    "sublabel": "high-speed long-horizon coding with vision"
  },
  {
    "value": "moonshotai/kimi-k2.6",
    "label": "Kimi K2.6",
    "sublabel": "long-horizon coding with vision"
  },
  {
    "value": "moonshotai/kimi-k2.5",
    "label": "Kimi K2.5",
    "sublabel": "multimodal frontend coding"
  },
  {
    "value": "z-ai/glm-5.3-flash",
    "label": "Glm 5.3 Flash",
    "sublabel": "fast, affordable GLM coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "z-ai/glm-5.3-flashx",
    "label": "Glm 5.3 Flashx",
    "sublabel": "high-speed GLM-5.3 Flash with 1M context",
    "badge": "1M context"
  },
  {
    "value": "zai-org/glm-5.3",
    "label": "Glm 5.3",
    "sublabel": "frontier coding with emergent cyber capabilities",
    "badge": "frontier"
  },
  {
    "value": "zai-org/glm-5.2",
    "label": "Glm 5.2",
    "sublabel": "powerful coding with 1M context and long-horizon tasks",
    "badge": "1M context"
  },
  {
    "value": "zai-org/glm-5.2-fast",
    "label": "Glm 5.2 Fast",
    "sublabel": "high-throughput GLM-5.2 with 1M context",
    "badge": "1M context"
  },
  {
    "value": "zai-org/glm-5.1",
    "label": "Glm 5.1",
    "sublabel": "long-horizon autonomous coding agent"
  },
  {
    "value": "zai-org/glm-5",
    "label": "Glm 5",
    "sublabel": "multi-mode thinking & long-range planning"
  },
  {
    "value": "minimax/minimax-m3.1-flash",
    "label": "Minimax M3.1 Flash",
    "sublabel": "multimodal coding with tunable thinking depth"
  },
  {
    "value": "minimaxai/minimax-m3",
    "label": "Minimax M3",
    "sublabel": "frontier coding, agents & native multimodality",
    "badge": "frontier"
  },
  {
    "value": "minimaxai/minimax-m2.7",
    "label": "Minimax M2.7",
    "sublabel": "end-to-end software engineering agent"
  },
  {
    "value": "minimaxai/minimax-m2.5",
    "label": "Minimax M2.5",
    "sublabel": "cross-platform full-stack agentic dev"
  },
  {
    "value": "ornith/ornith-1.5-122b",
    "label": "Ornith 1.5 122b",
    "sublabel": "open-weight MoE for fast agentic coding",
    "badge": "fast"
  },
  {
    "value": "xiaomi/mimo-v2.6-pro",
    "label": "Mimo V2.6 Pro",
    "sublabel": "flagship multimodal agentic coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "xiaomi/mimo-v2.6-pro-ultraspeed",
    "label": "Mimo V2.6 Pro Ultraspeed",
    "sublabel": "low-latency serving tier of MiMo V2.6 Pro"
  },
  {
    "value": "xiaomi/mimo-v2.6-flash",
    "label": "Mimo V2.6 Flash",
    "sublabel": "efficient multimodal agentic coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "qwen/qwen3.8-omni-flash",
    "label": "Qwen 3.8 Omni Flash",
    "sublabel": "omni-modal understanding & multimedia agentic work",
    "badge": "omni-modal"
  },
  {
    "value": "qwen/qwen3.8-max-prime",
    "label": "Qwen 3.8 Max Prime",
    "sublabel": "high-speed Qwen 3.8 Max: 1.5–2× faster output",
    "badge": "fast"
  },
  {
    "value": "qwen/qwen3.8-max-0902",
    "label": "Qwen 3.8 Max 0902",
    "sublabel": "upgraded Qwen 3.8 Max: stronger coding & agentic tool use"
  },
  {
    "value": "qwen/qwen3.8-max",
    "label": "Qwen 3.8 Max",
    "sublabel": "autonomous long-horizon coding & professional work"
  },
  {
    "value": "qwen/qwen3.8-27b",
    "label": "Qwen 3.8 27b",
    "sublabel": "compact vision-language coding & agentic work"
  },
  {
    "value": "qwen/qwen3.8-flash",
    "label": "Qwen 3.8 Flash",
    "sublabel": "fast low-cost agentic coding & reasoning",
    "badge": "fast"
  },
  {
    "value": "qwen/qwen3.7-max",
    "label": "Qwen 3.7 Max",
    "sublabel": "frontier coding & long-horizon agent execution",
    "badge": "frontier"
  },
  {
    "value": "qwen/qwen3.7-plus",
    "label": "Qwen 3.7 Plus",
    "sublabel": "agentic coding & reasoning at lower cost"
  },
  {
    "value": "qwen/qwen3.7-flash",
    "label": "Qwen 3.7 Flash",
    "sublabel": "fast low-cost agentic coding & reasoning",
    "badge": "fast"
  },
  {
    "value": "qwen/qwen3.6-max-preview",
    "label": "Qwen 3.6 Max Preview",
    "sublabel": "vibe coding & efficient agent execution"
  },
  {
    "value": "qwen/qwen3.6-plus",
    "label": "Qwen 3.6 Plus",
    "sublabel": "agentic coding & reasoning"
  },
  {
    "value": "meituan/longcat-2.0",
    "label": "Longcat 2.0",
    "sublabel": "trillion-parameter agentic coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "stepfun/step-5-preview",
    "label": "Step 5 Preview",
    "sublabel": "600B sparse-MoE agentic coding with 1M context",
    "badge": "1M context"
  },
  {
    "value": "stepfun/step-3.7-flash",
    "label": "Step 3.7 Flash",
    "sublabel": "multimodal sparse-MoE reasoning"
  },
  {
    "value": "stepfun/step-3.5-flash",
    "label": "Step 3.5 Flash",
    "sublabel": "fast sparse-MoE agentic reasoning",
    "badge": "fast"
  },
  {
    "value": "tencent/hy3-paid",
    "label": "Hy3 Paid",
    "sublabel": "sparse-MoE reasoning & agentic tool use"
  },
  {
    "value": "tencent/hy4-preview",
    "label": "Hy4 Preview",
    "sublabel": "agentic coding & sustained multi-step tool use"
  },
  {
    "value": "nvidia/nemotron-3-ultra-550b-a55b",
    "label": "Nemotron 3 Ultra 550b A55b",
    "sublabel": "open reasoning model for long-horizon autonomous agents"
  },
  {
    "value": "nvidia/nemotron-3.5-super-vl",
    "label": "Nemotron 3.5 Super Vl",
    "sublabel": "open vision-language model for coding and documents"
  },
  {
    "value": "thinkingmachines/inkling",
    "label": "Inkling",
    "sublabel": "multimodal MoE reasoning"
  },
  {
    "value": "thinkingmachines/inkling-small",
    "label": "Inkling Small",
    "sublabel": "lightweight MoE reasoning at lower cost and latency"
  },
  {
    "value": "reflection/beam:free",
    "label": "Beam:Free",
    "sublabel": "FREE reasoning model for coding and agentic workflows",
    "badge": "free"
  },
  {
    "value": "poolside/laguna-s-2.1-free",
    "label": "Laguna S 2.1 Free",
    "sublabel": "FREE open-weight agentic coding and long-horizon work",
    "badge": "free"
  },
  {
    "value": "inclusionai/ling-3.1-flash",
    "label": "Ling 3.1 Flash",
    "sublabel": "hybrid-reasoning MoE for coding & tool-using agents"
  },
  {
    "value": "mistral/mistral-large-4",
    "label": "Mistral Large 4",
    "sublabel": "frontier open-weight multimodal model for coding & analysis",
    "badge": "frontier"
  },
  {
    "value": "stealth/glyph-cluster:free",
    "label": "Glyph Cluster:Free",
    "sublabel": "FREE stealth reasoning model in early access",
    "badge": "free"
  },
  {
    "value": "claude-sonnet-5-5",
    "label": "Claude Sonnet 5.5",
    "sublabel": "best combo of speed & intelligence (recommended)",
    "badge": "recommended"
  },
  {
    "value": "claude-sonnet-5",
    "label": "Claude Sonnet 5",
    "sublabel": "prev Sonnet, still fast & capable",
    "badge": "fast"
  },
  {
    "value": "claude-sonnet-4-6",
    "label": "Claude Sonnet 4.6",
    "sublabel": "older Sonnet, still fast & capable",
    "badge": "fast"
  },
  {
    "value": "claude-fable-5-1",
    "label": "Claude Fable 5.1",
    "sublabel": "most capable for demanding reasoning & long-horizon agents"
  },
  {
    "value": "claude-fable-5",
    "label": "Claude Fable 5",
    "sublabel": "prev Fable, still strong for deep reasoning & agents"
  },
  {
    "value": "claude-opus-5-5",
    "label": "Claude Opus 5.5",
    "sublabel": "most intelligent Opus for agents and coding"
  },
  {
    "value": "claude-opus-5",
    "label": "Claude Opus 5",
    "sublabel": "prev flagship, still strong for agents and coding"
  },
  {
    "value": "claude-opus-4-8",
    "label": "Claude Opus 4.8",
    "sublabel": "older Opus, still strong for agents and coding"
  },
  {
    "value": "claude-opus-4-7",
    "label": "Claude Opus 4.7",
    "sublabel": "older Opus, still strong for agents and coding"
  },
  {
    "value": "claude-haiku-5-5",
    "label": "Claude Haiku 5.5",
    "sublabel": "fastest & most compact, great for quick tasks",
    "badge": "fast"
  },
  {
    "value": "claude-haiku-4-5",
    "label": "Claude Haiku 4.5",
    "sublabel": "prev Haiku, still fast for quick tasks",
    "badge": "fast"
  },
  {
    "value": "gpt-6-astra",
    "label": "Gpt 6 Astra",
    "sublabel": "most capable OpenAI model for demanding reasoning & agents"
  },
  {
    "value": "gpt-6.1-sol",
    "label": "Gpt 6.1 Sol",
    "sublabel": "near-Astra performance for complex work at a lower cost"
  },
  {
    "value": "gpt-6-sol",
    "label": "Gpt 6 Sol",
    "sublabel": "built for complex coding & agentic workflows"
  },
  {
    "value": "gpt-6-luna",
    "label": "Gpt 6 Luna",
    "sublabel": "most efficient OpenAI model for focused, high-volume tasks"
  },
  {
    "value": "gpt-5.6-sol",
    "label": "Gpt 5.6 Sol",
    "sublabel": "frontier model for complex professional work",
    "badge": "frontier"
  },
  {
    "value": "gpt-5.6-terra",
    "label": "Gpt 5.6 Terra",
    "sublabel": "balances intelligence and cost"
  },
  {
    "value": "gpt-5.6-luna",
    "label": "Gpt 5.6 Luna",
    "sublabel": "optimized for cost-sensitive workloads"
  },
  {
    "value": "gpt-5.5",
    "label": "Gpt 5.5",
    "sublabel": "latest frontier model for general complex work",
    "badge": "frontier"
  },
  {
    "value": "gpt-5.4",
    "label": "Gpt 5.4",
    "sublabel": "frontier model for general complex work",
    "badge": "frontier"
  },
  {
    "value": "gpt-5.3-codex",
    "label": "Gpt 5.3 Codex",
    "sublabel": "frontier coding model",
    "badge": "frontier"
  },
  {
    "value": "gpt-5.4-mini",
    "label": "Gpt 5.4 Mini",
    "sublabel": "fast, cost-effective model for everyday tasks",
    "badge": "fast"
  },
  {
    "value": "google/gemini-4-argon",
    "label": "Gemini 4 Argon",
    "sublabel": "multimodal reasoning for documents and agent workflows"
  },
  {
    "value": "google/gemini-3.8-flash",
    "label": "Gemini 3.8 Flash",
    "sublabel": "newest Gemini Flash, improved core reasoning"
  },
  {
    "value": "google/gemini-3.7-flash",
    "label": "Gemini 3.7 Flash",
    "sublabel": "higher-quality coding & agentic workflows, fewer tokens"
  },
  {
    "value": "google/gemini-3.6-flash",
    "label": "Gemini 3.6 Flash",
    "sublabel": "previous Gemini Flash, still fast & capable",
    "badge": "fast"
  },
  {
    "value": "google/gemini-3.5-flash",
    "label": "Gemini 3.5 Flash",
    "sublabel": "Pro-level coding proficiency, parallel agentic execution"
  },
  {
    "value": "google/gemini-3.5-flash-lite",
    "label": "Gemini 3.5 Flash Lite",
    "sublabel": "upgraded agentic capabilities, ideal for subagents"
  },
  {
    "value": "google/gemini-3.1-flash-lite",
    "label": "Gemini 3.1 Flash Lite",
    "sublabel": "high-volume workhorse model with implicit caching"
  },
  {
    "value": "sakana/fugu-ultra",
    "label": "Fugu Ultra",
    "sublabel": "multi-agent orchestration across frontier models",
    "badge": "frontier"
  },
  {
    "value": "meta/muse-spark-1.1",
    "label": "Muse Spark 1.1",
    "sublabel": "agentic performance, tool use, and computer use"
  },
  {
    "value": "meta/muse-spark-1.2",
    "label": "Muse Spark 1.2",
    "sublabel": "coding-optimized for agentic workflows and large codebases"
  },
  {
    "value": "meta/muse-spark-1.2-contributor",
    "label": "Muse Spark 1.2 Contributor",
    "sublabel": "Muse Spark 1.2 at ~95% off"
  },
  {
    "value": "meta/muse-spark-1.3",
    "label": "Muse Spark 1.3",
    "sublabel": "multimodal reasoning for long-horizon agentic and coding workflows"
  },
  {
    "value": "meta/muse-spark-1.3-contributor",
    "label": "Muse Spark 1.3 Contributor",
    "sublabel": "Muse Spark 1.3 at up to 95% off"
  },
  {
    "value": "meta/muse-spark-open",
    "label": "Muse Spark Open",
    "sublabel": "open-weight Muse Spark for coding and agentic workflows"
  },
  {
    "value": "meta/muse-wonder-1.0",
    "label": "Muse Wonder 1.0",
    "sublabel": "frontier coding, long-running agents and advanced computer use",
    "badge": "frontier"
  },
  {
    "value": "xai/grok-4.5",
    "label": "Grok 4.5",
    "sublabel": "smartest model for coding, agentic tasks, knowledge work"
  },
  {
    "value": "xai/grok-4.6",
    "label": "Grok 4.6",
    "sublabel": "frontier performance on coding, knowledge work, and STEM",
    "badge": "frontier"
  },
  {
    "value": "xai/grok-4.7",
    "label": "Grok 4.7",
    "sublabel": "coding and knowledge work, built for multi-hour tasks"
  }
]

export const FALLBACK_PEN_MODELS: SearchSelectOption[] = [
  {
    value: "gemini:gemini-3.6-flash",
    label: "Gemini 3.6 Flash (Fast & Efficient)",
    badge: "Default",
    sublabel: "fastest headless design generator",
  },
  {
    value: "gemini:gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    badge: "Gemini",
    sublabel: "complex UI hierarchy & layouts",
  },
  {
    value: "claude:claude-3-7-sonnet",
    label: "Claude 3.7 Sonnet",
    badge: "Claude",
    sublabel: "detailed aesthetics & component design",
  },
  {
    value: "deepseek:deepseek-chat",
    label: "DeepSeek V3",
    badge: "DeepSeek",
    sublabel: "open-weights design model",
  },
]

export function useExecutorModels(executor: string): {
  models: SearchSelectOption[]
  isLoading: boolean
  isError: boolean
} {
  const norm =
    executor === "cmd"
      ? "commandcode"
      : executor === "pen_cli" || executor === "pencil" || executor === "pen"
        ? "pen"
        : executor
  const isApplicable = norm === "dsh" || norm === "commandcode" || norm === "pen"

  const { data, isLoading, isError } = useQuery({
    queryKey: ["models", norm],
    queryFn: () => listExecutorModels(norm),
    enabled: isApplicable,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  if (!isApplicable) {
    return { models: [], isLoading: false, isError: false }
  }

  const fallback =
    norm === "dsh"
      ? FALLBACK_DSH_MODELS
      : norm === "pen"
        ? FALLBACK_PEN_MODELS
        : FALLBACK_COMMANDCODE_MODELS
  const models = data?.models && data.models.length > 0 ? (data.models as SearchSelectOption[]) : fallback

  return { models, isLoading, isError }
}
