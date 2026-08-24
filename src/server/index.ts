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

/* Mensaje enviado una vez que la persona confirma su nombre. */
type JoinMessage = {
	type: "join";
	user: string;
};

type ConnectionState = {
	joined: boolean;
	user?: string;
};

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	/* Envía mensajes solo a vecinos que ya entraron al chat. */
	broadcastToJoined(
		message: Message | TypingMessage,
		exclude: string[] = [],
	) {
		const data = JSON.stringify(message);

		for (const connection of this.getConnections<ConnectionState>()) {
			if (
				connection.state?.joined &&
				!exclude.includes(connection.id)
			) {
				connection.send(data);
			}
		}
	}

	onStart() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
		);

		/*
			Se conserva el historial en el servidor para administración,
			pero nunca se envía automáticamente a quien recién llega.
		*/
		this.messages = this.ctx.storage.sql
			.exec(`SELECT * FROM messages`)
			.toArray() as ChatMessage[];
	}

	onConnect(connection: Connection) {
		/* Una conexión sin nombre todavía no puede recibir mensajes. */
		connection.setState<ConnectionState>({ joined: false });
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
			| TypingMessage
			| JoinMessage;

		/* Registrar a la persona sin revelar ningún historial. */
		if (parsed.type === "join") {
			const user = parsed.user.trim().slice(0, 30);

			if (user.length >= 2) {
				connection.setState<ConnectionState>({ joined: true, user });
			}

			return;
		}

		/* Ignora cualquier mensaje de una conexión que aún no ha ingresado. */
		if (!(connection.state as ConnectionState | null)?.joined) {
			return;
		}

		if (parsed.type === "typing") {
			this.broadcastToJoined(parsed, [connection.id]);
			return;
		}

		if (parsed.type === "add" || parsed.type === "update") {
			this.saveMessage(parsed);
			this.broadcastToJoined(parsed);
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
