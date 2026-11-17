import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import type { UIMessage, UIToolCall } from "../types/agui";

interface MessageBubbleProps {
  message: UIMessage;
}

function ToolCallCard({ toolCall }: { toolCall: UIToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `Tool: ${toolCall.name}\nArgs: ${toolCall.args}${toolCall.result ? `\nResult: ${toolCall.result}` : ""}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  let statusIcon = null;
  if (toolCall.status === "streaming") {
    statusIcon = <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  } else if (toolCall.status === "done") {
    statusIcon = <Check className="h-3 w-3 text-green-500" />;
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-100"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-gray-800">{toolCall.name}</span>
          {statusIcon}
        </div>
        <div className="flex items-center gap-1">
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            role="button"
            className="cursor-pointer rounded p-1 text-gray-500 hover:bg-white hover:text-gray-700"
            title="复制"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 px-3 py-2 text-xs">
          {toolCall.args && (
            <div className="mb-2">
              <div className="mb-1 font-medium text-gray-600">参数</div>
              <pre className="overflow-x-auto rounded bg-white p-2 text-gray-800">
                {toolCall.args || "{}"}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="mb-1 font-medium text-gray-600">结果</div>
              <pre className="max-h-40 overflow-x-auto rounded bg-white p-2 text-gray-800">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamingIndicator() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
    </span>
  );
}

function formatContent(content: string): string {
  return content;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
          <Bot className="h-5 w-5" />
        </div>
      )}
      <div
        className={`max-w-[75%] break-words rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-gray-200 bg-white text-gray-900"
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.content ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {formatContent(message.content)}
            {message.isStreaming && <StreamingIndicator />}
          </div>
        ) : message.isStreaming ? (
          <div className="text-sm text-gray-500">
            <StreamingIndicator />
          </div>
        ) : null}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 shadow-sm">
          <User className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

interface ChatInterfaceProps {
  messages: UIMessage[];
  isRunning: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  agentEndpoint: string;
  onEndpointChange: (url: string) => void;
  error?: string | null;
}

export default function ChatInterface({
  messages,
  isRunning,
  onSend,
  onClear,
  agentEndpoint,
  onEndpointChange,
  error,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">AG-UI 智能助手</h2>
            <p className="text-xs text-gray-500">
              {isRunning ? (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  正在处理...
                </span>
              ) : (
                "就绪"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <label className="text-xs text-gray-500">Endpoint:</label>
            <input
              type="url"
              value={agentEndpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="http://localhost:9000/send-message"
              className="w-72 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={isRunning || messages.length === 0}
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="清空对话"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">清空</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-gray-50/80 to-white px-5 py-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
              <Bot className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">开始对话</h3>
            <p className="max-w-md text-sm text-gray-500">
              这是一个基于 AG-UI 协议的流式聊天界面。输入您的问题，Agent 会以流式方式逐字回复，并实时展示工具调用过程。
            </p>
            <div className="mt-6 grid w-full max-w-lg grid-cols-2 gap-3 md:grid-cols-3">
              {[
                "介绍一下你自己",
                "帮我写个 React 组件",
                "查询今天的天气",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSend(q)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 bg-white px-5 py-4"
      >
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送，Shift + Enter 换行"
            rows={1}
            disabled={isRunning}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isRunning || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400">
          Powered by AG-UI Protocol · @ag-ui/client
        </p>
      </form>
    </div>
  );
}
