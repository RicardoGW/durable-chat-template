import {
	type Connection,
	Server,
	type WSMessage,
	routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

type TypingMessage = {
	type: "typing";
	user: string;
	typing: boolean;
};

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	broadcastMessage(message: Message | TypingMessage, exclude?: string[]) {
		this.broadcast(JSON.stringify(message), exclude);
	}

	onStart() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
		);

		this.messages = this.ctx.storage.sql
			.exec(`SELECT * FROM messages`)
			.toArray() as ChatMessage[];
	}

	onConnect(connection: Connection) {
		connection.send(
			JSON.stringify({
				type: "all",
				messages: this.messages,
			} satisfies Message),
		);
	}

	saveMessage(message: ChatMessage) {
		const existingMessage = this.messages.find(
			(m) => m.id === message.id,
		);

		if (existingMessage) {
			this.messages = this.messages.map((m) =>
				m.id === message.id ? message : m,
			);
		} else {
			this.messages.push(message);
		}

		this.ctx.storage.sql.exec(
			`INSERT INTO messages (id, user, role, content)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET content = ?`,
			message.id,
			message.user,
			message.role,
			message.content,
			message.content,
		);
	}

	onMessage(connection: Connection, message: WSMessage) {
		const parsed = JSON.parse(message as string) as
			| Message
			| TypingMessage;

		if (parsed.type === "typing") {
			this.broadcastMessage(parsed, [connection.id]);
			return;
		}

		this.broadcast(message);

		if (parsed.type === "add" || parsed.type === "update") {
			this.saveMessage(parsed);
		}
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routePartykitRequest(request, { ...env })) ||
			env.ASSETS.fetch(request)
		);
	},
} satisfies ExportedHandler<Env>;
