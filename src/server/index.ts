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

type JoinMessage = {
	type: "join";
	user: string;
};

type OnlineUser = {
	id: string;
	user: string;
};

type OnlineUsersMessage = {
	type: "online_users";
	users: OnlineUser[];
};

type HistoryMessage = {
	type: "history";
	messages: ChatMessage[];
};

type ReactionMessage = {
	type: "reaction";
	messageId: string;
	emoji: string;
	user: string;
};

type ServerMessage =
	| Message
	| TypingMessage
	| JoinMessage
	| OnlineUsersMessage
	| HistoryMessage
	| ReactionMessage;

type ConnectionState = {
	joined: boolean;
	user?: string;
};

function getChileDay() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Santiago",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());

	const year = parts.find(
		(part) => part.type === "year",
	)?.value;

	const month = parts.find(
		(part) => part.type === "month",
	)?.value;

	const day = parts.find(
		(part) => part.type === "day",
	)?.value;

	return `${year}-${month}-${day}`;
}

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	currentDay = "";

	broadcastToJoined(
		message:
			| Message
			| TypingMessage
			| ReactionMessage,
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

	getOnlineUsers(): OnlineUser[] {
		return Array.from(
			this.getConnections<ConnectionState>(),
		)
			.filter(
				(connection) =>
					connection.state?.joined &&
					connection.state?.user,
			)
			.map((connection) => ({
				id: connection.id,
				user: connection.state!.user!,
			}));
	}

	broadcastOnlineUsers() {
		const message: OnlineUsersMessage = {
			type: "online_users",
			users: this.getOnlineUsers(),
		};

		const data = JSON.stringify(message);

		for (const connection of this.getConnections<ConnectionState>()) {
			if (connection.state?.joined) {
				connection.send(data);
			}
		}
	}

	cleanOldMessages() {
		const today = getChileDay();

		this.ctx.storage.sql.exec(
			`DELETE FROM messages WHERE day != ? OR day IS NULL`,
			today,
		);

		this.messages = this.ctx.storage.sql
			.exec(
				`SELECT id, user, role, content
				 FROM messages
				 WHERE day = ?
				 ORDER BY rowid ASC`,
				today,
			)
			.toArray() as ChatMessage[];

		this.currentDay = today;
	}

	onStart() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				user TEXT,
				role TEXT,
				content TEXT,
				day TEXT
			)`,
		);

		try {
			this.ctx.storage.sql.exec(
				`ALTER TABLE messages ADD COLUMN day TEXT`,
			);
		} catch {
			/* La columna ya existe. */
		}

		this.cleanOldMessages();
	}

	onConnect(connection: Connection) {
		connection.setState<ConnectionState>({
			joined: false,
		});
	}

	onClose(
		connection: Connection,
		_code: number,
		_reason: string,
		_wasClean: boolean,
	) {
		if (connection.state?.joined) {
			this.broadcastOnlineUsers();
		}
	}

	saveMessage(message: ChatMessage) {
		const today = getChileDay();

		if (this.currentDay !== today) {
			this.cleanOldMessages();
		}

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
			`INSERT INTO messages
				(id, user, role, content, day)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET
				content = ?,
				user = ?,
				role = ?,
				day = ?`,
			message.id,
			message.user,
			message.role,
			message.content,
			today,
			message.content,
			message.user,
			message.role,
			today,
		);
	}

	sendHistory(connection: Connection) {
		const today = getChileDay();

		if (this.currentDay !== today) {
			this.cleanOldMessages();
		}

		const historyMessage: HistoryMessage = {
			type: "history",
			messages: this.messages,
		};

		connection.send(
			JSON.stringify(historyMessage),
		);
	}

	onMessage(connection: Connection, message: WSMessage) {
		let parsed: ServerMessage;

		try {
			parsed = JSON.parse(message as string) as ServerMessage;
		} catch {
			return;
		}

		/* INGRESO */

		if (parsed.type === "join") {
			const user = parsed.user.trim().slice(0, 30);

			if (user.length >= 2) {
				connection.setState<ConnectionState>({
					joined: true,
					user,
				});

				this.sendHistory(connection);
				this.broadcastOnlineUsers();
			}

			return;
		}

		/* CONEXIÓN NO IDENTIFICADA */

		if (
			!(connection.state as ConnectionState | null)
				?.joined
		) {
			return;
		}

		/* ESTÁ ESCRIBIENDO */

		if (parsed.type === "typing") {
			this.broadcastToJoined(
				parsed,
				[connection.id],
			);
			return;
		}

		/* REACCIÓN */

		if (parsed.type === "reaction") {
			const reaction: ReactionMessage = {
				type: "reaction",
				messageId: parsed.messageId,
				emoji: parsed.emoji,
				user:
					connection.state?.user ||
					parsed.user,
			};

			this.broadcastToJoined(reaction);
			return;
		}

		/* MENSAJE */

		if (
			parsed.type === "add" ||
			parsed.type === "update"
		) {
			this.saveMessage(parsed);
			this.broadcastToJoined(parsed);
		}
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routePartykitRequest(request, {
				...env,
			})) ||
			env.ASSETS.fetch(request)
		);
	},
} satisfies ExportedHandler<Env>;
