import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInterface from "../components/ChatInterface";
import {
  AgentClient,
  EventStreamProcessor,
} from "../services/agentClient";
import type { AGUIEvent, Message, UIMessage } from "../types/agui";

const DEFAULT_ENDPOINT = "http://localhost:9000/send-message";

function useEndpointStorage(): [string, (v: string) => void] {
  const [endpoint, setEndpointState] = useState<string>(() => {
    try {
      return localStorage.getItem("agui.endpoint") || DEFAULT_ENDPOINT;
    } catch {
      return DEFAULT_ENDPOINT;
    }
  });

  const setEndpoint = useCallback((value: string) => {
    setEndpointState(value);
    try {
      localStorage.setItem("agui.endpoint", value);
    } catch {
      /* ignore */
    }
  }, []);

  return [endpoint, setEndpoint];
}

const AgentPage = () => {
  const [endpoint, setEndpoint] = useEndpointStorage();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientReady, setClientReady] = useState(false);

  const clientRef = useRef<AgentClient | null>(null);
  const processorRef = useRef<EventStreamProcessor | null>(null);
  const historyMessagesRef = useRef<Message[]>([]);

  const processor = useMemo(() => {
    if (!processorRef.current) {
      processorRef.current = new EventStreamProcessor();
    }
    return processorRef.current;
  }, []);

  useEffect(() => {
    const unsubscribe = processor.subscribe((msgs) => {
      setMessages([...msgs]);
    });
    return unsubscribe;
  }, [processor]);

  useEffect(() => {
    try {
      clientRef.current = new AgentClient({
        baseUrl: endpoint,
      });
      setClientReady(true);
    } catch (err) {
      setClientReady(false);
      setError(err instanceof Error ? err.message : "初始化客户端失败");
    }
  }, [endpoint]);

  const handleClear = useCallback(() => {
    processor.clear();
    historyMessagesRef.current = [];
    setError(null);
  }, [processor]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!clientRef.current || !clientReady) {
        setError("Agent 客户端未就绪，请检查 Endpoint 配置");
        return;
      }
      if (isRunning) return;

      setError(null);
      setIsRunning(true);
      try {
        const userMessage = clientRef.current.createMessage("user", text);
        historyMessagesRef.current.push(userMessage);
        processor.addUserMessage(text);

        const events: AGUIEvent[] = [];
        for await (const event of clientRef.current.run([
          ...historyMessagesRef.current,
        ])) {
          events.push(event);
          processor.processEvent(event);

          if (event.type === "RUN_ERROR") {
            throw new Error(event.message || "Agent 运行错误");
          }
        }

        const assistantEvents = events.filter(
          (e) => e.type === "TEXT_MESSAGE_END"
        );
        for (const endEv of assistantEvents) {
          const id = (endEv as { messageId: string }).messageId;
          const uiMsgs = processor.getMessages();
          const found = uiMsgs.find((m) => m.id === id);
          if (found) {
            historyMessagesRef.current.push({
              id: found.id,
              role: found.role,
              content: found.content,
            });
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "未知错误";
        setError(msg);
        console.error("[AG-UI] 发送失败:", err);
      } finally {
        setIsRunning(false);
      }
    },
    [clientReady, isRunning, processor]
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <ChatInterface
        messages={messages}
        isRunning={isRunning}
        onSend={handleSend}
        onClear={handleClear}
        agentEndpoint={endpoint}
        onEndpointChange={setEndpoint}
        error={error}
      />

      <div className="mt-6 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            AG-UI 事件说明
          </h3>
          <ul className="space-y-1.5 text-xs text-gray-600">
            <li>
              <span className="font-mono text-indigo-600">TEXT_MESSAGE_*</span>{" "}
              — 逐字流式文本回复
            </li>
            <li>
              <span className="font-mono text-indigo-600">TOOL_CALL_*</span> —
              工具调用过程（参数流式 + 结果）
            </li>
            <li>
              <span className="font-mono text-indigo-600">RUN_*</span> —
              运行生命周期（开始/结束/错误）
            </li>
            <li>
              <span className="font-mono text-indigo-600">STATE_*</span> /{" "}
              <span className="font-mono text-indigo-600">MESSAGES_SNAPSHOT</span>{" "}
              — 状态同步
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            快速启动本地 Agent
          </h3>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
{`# 使用 @cloudbase/agent-server
npm i @cloudbase/agent-server@latest
# 启动后 Endpoint 默认为:
# http://localhost:9000/send-message`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default AgentPage;
