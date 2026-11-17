export type AGUIEventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "MESSAGES_SNAPSHOT";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface RunAgentInput {
  threadId: string;
  runId: string;
  messages: Message[];
  tools?: Tool[];
  state?: unknown;
  context?: unknown[];
  forwardedProps?: Record<string, unknown>;
}

export interface BaseEvent {
  type: AGUIEventType;
  threadId?: string;
  runId?: string;
}

export interface RunStartedEvent extends BaseEvent {
  type: "RUN_STARTED";
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends BaseEvent {
  type: "RUN_FINISHED";
  threadId: string;
  runId: string;
}

export interface RunErrorEvent extends BaseEvent {
  type: "RUN_ERROR";
  message: string;
  code?: string;
}

export interface TextMessageStartEvent extends BaseEvent {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  role: MessageRole;
}

export interface TextMessageContentEvent extends BaseEvent {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: "TEXT_MESSAGE_END";
  messageId: string;
}

export interface ToolCallStartEvent extends BaseEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends BaseEvent {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
}

export interface ToolCallResultEvent extends BaseEvent {
  type: "TOOL_CALL_RESULT";
  toolCallId: string;
  messageId: string;
  content: string;
}

export interface StateSnapshotEvent extends BaseEvent {
  type: "STATE_SNAPSHOT";
  snapshot: unknown;
}

export interface StateDeltaEvent extends BaseEvent {
  type: "STATE_DELTA";
  delta: unknown[];
}

export interface MessagesSnapshotEvent extends BaseEvent {
  type: "MESSAGES_SNAPSHOT";
  messages: Message[];
}

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent;

export interface UIToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: "streaming" | "done" | "error";
}

export interface UIMessage {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming: boolean;
  toolCalls?: UIToolCall[];
  timestamp: number;
}
