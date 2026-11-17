import { HttpAgent } from "@ag-ui/client";
import type {
  AGUIEvent,
  Message,
  UIMessage,
  UIToolCall,
} from "../types/agui";

export interface AgentClientOptions {
  baseUrl: string;
  threadId?: string;
}

export class AgentClient {
  private httpAgent: HttpAgent;
  private baseUrl: string;
  private threadId: string;
  private runCounter = 0;

  constructor(options: AgentClientOptions) {
    this.baseUrl = options.baseUrl;
    this.threadId = options.threadId ?? `thread-${Date.now()}`;
    this.httpAgent = new HttpAgent({ url: this.baseUrl });
  }

  setThreadId(threadId: string): void {
    this.threadId = threadId;
  }

  getThreadId(): string {
    return this.threadId;
  }

  private nextRunId(): string {
    this.runCounter += 1;
    return `run-${this.threadId}-${this.runCounter}-${Date.now()}`;
  }

  createMessage(role: Message["role"], content: string): Message {
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role,
      content,
    };
  }

  async *run(messages: Message[]): AsyncGenerator<AGUIEvent> {
    const runId = this.nextRunId();
    const input = {
      threadId: this.threadId,
      runId,
      messages,
    } as unknown as Parameters<HttpAgent["run"]>[0];

    const stream = this.httpAgent.run(input);
    for await (const event of stream as unknown as AsyncIterable<AGUIEvent>) {
      yield event;
    }
  }
}

export function createInitialUIMessage(
  role: UIMessage["role"],
  content: string,
  isStreaming = false
): UIMessage {
  return {
    id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    isStreaming,
    toolCalls: [],
    timestamp: Date.now(),
  };
}

export class EventStreamProcessor {
  private uiMessages: Map<string, UIMessage> = new Map();
  private toolCallBuffer: Map<string, UIToolCall> = new Map();
  private listeners: Set<(messages: UIMessage[]) => void> = new Set();

  subscribe(callback: (messages: UIMessage[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getMessages());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(): void {
    const msgs = this.getMessages();
    for (const listener of this.listeners) {
      listener(msgs);
    }
  }

  getMessages(): UIMessage[] {
    return Array.from(this.uiMessages.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }

  addUserMessage(content: string): UIMessage {
    const msg: UIMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: "user",
      content,
      isStreaming: false,
      toolCalls: [],
      timestamp: Date.now(),
    };
    this.uiMessages.set(msg.id, msg);
    this.emit();
    return msg;
  }

  processEvent(event: AGUIEvent): void {
    switch (event.type) {
      case "TEXT_MESSAGE_START":
        this.uiMessages.set(event.messageId, {
          id: event.messageId,
          role: event.role,
          content: "",
          isStreaming: true,
          toolCalls: [],
          timestamp: Date.now(),
        });
        break;

      case "TEXT_MESSAGE_CONTENT": {
        const existing = this.uiMessages.get(event.messageId);
        if (existing) {
          existing.content += event.delta;
        } else {
          this.uiMessages.set(event.messageId, {
            id: event.messageId,
            role: "assistant",
            content: event.delta,
            isStreaming: true,
            toolCalls: [],
            timestamp: Date.now(),
          });
        }
        break;
      }

      case "TEXT_MESSAGE_END": {
        const msg = this.uiMessages.get(event.messageId);
        if (msg) {
          msg.isStreaming = false;
        }
        break;
      }

      case "TOOL_CALL_START": {
        const toolCall: UIToolCall = {
          id: event.toolCallId,
          name: event.toolCallName,
          args: "",
          status: "streaming",
        };
        this.toolCallBuffer.set(event.toolCallId, toolCall);
        break;
      }

      case "TOOL_CALL_ARGS": {
        const tc = this.toolCallBuffer.get(event.toolCallId);
        if (tc) {
          tc.args += event.delta;
        }
        break;
      }

      case "TOOL_CALL_END": {
        const tc = this.toolCallBuffer.get(event.toolCallId);
        if (tc) {
          tc.status = "done";
        }
        break;
      }

      case "TOOL_CALL_RESULT": {
        const tc = this.toolCallBuffer.get(event.toolCallId);
        if (tc) {
          tc.result = event.content;
          tc.status = "done";
        }
        const msg = this.uiMessages.get(event.messageId);
        if (msg) {
          const tcCopy = this.toolCallBuffer.get(event.toolCallId);
          if (tcCopy && !msg.toolCalls?.find((t) => t.id === tcCopy.id)) {
            msg.toolCalls = msg.toolCalls ?? [];
            msg.toolCalls.push({ ...tcCopy });
          }
        }
        break;
      }

      case "MESSAGES_SNAPSHOT": {
        for (const m of event.messages) {
          if (!this.uiMessages.has(m.id)) {
            this.uiMessages.set(m.id, {
              id: m.id,
              role: m.role,
              content: m.content,
              isStreaming: false,
              toolCalls: [],
              timestamp: Date.now(),
            });
          }
        }
        break;
      }

      case "RUN_ERROR":
        for (const msg of this.uiMessages.values()) {
          if (msg.isStreaming) {
            msg.isStreaming = false;
          }
        }
        break;

      case "RUN_FINISHED":
        for (const msg of this.uiMessages.values()) {
          if (msg.isStreaming) {
            msg.isStreaming = false;
          }
        }
        break;

      default:
        break;
    }
    this.emit();
  }

  clear(): void {
    this.uiMessages.clear();
    this.toolCallBuffer.clear();
    this.emit();
  }
}
