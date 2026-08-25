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

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	return `${year}-${month}-${day}`;
}

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	currentDay = "";

	/*
		Envía mensajes solamente a vecinos que ya confirmaron
		su nombre.
	*/
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

	/*
		Obtiene todos los vecinos conectados actualmente.
	*/
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

	/*
		Actualiza el listado de vecinos conectados para todos.
	*/
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

	/*
		Elimina los mensajes de días anteriores.
	*/
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
		/*
			Crea la tabla incluyendo el día del mensaje.
		*/
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				user TEXT,
				role TEXT,
				content TEXT,
				day TEXT
			)`,
		);

		/*
			Compatibilidad con la tabla antigua que no tenía
			la columna "day".
		*/
		try {
			this.ctx.storage.sql.exec(
				`ALTER TABLE messages ADD COLUMN day TEXT`,
			);
		} catch {
			/*
				La columna ya existe.
			*/
		}

		/*
			Los mensajes antiguos de la versión anterior no
			deben reaparecer como historial.
		*/
		this.cleanOldMessages();
	}

	onConnect(connection: Connection) {
		/*
			La persona todavía no ha confirmado su nombre.
		*/
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
		/*
			Actualiza inmediatamente la lista cuando alguien sale.
		*/
		if (connection.state?.joined) {
			this.broadcastOnlineUsers();
		}
	}

	/*
		Guarda un mensaje del día actual.
	*/
	saveMessage(message: ChatMessage) {
		const today = getChileDay();

		/*
			Si cambió el día, comenzamos un historial nuevo.
		*/
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

	/*
		Envía el historial actual del día a un vecino
		que acaba de entrar.
	*/
	sendHistory(connection: Connection) {
		const today = getChileDay();

		if (this.currentDay !== today) {
			this.cleanOldMessages();
		}

		const historyMessage: HistoryMessage = {
			type: "history",
			messages: this.messages,
		};

		connection.send(JSON.stringify(historyMessage));
	}

	onMessage(connection: Connection, message: WSMessage) {
		let parsed:
			| Message
			| TypingMessage
			| JoinMessage;

		try {
			parsed = JSON.parse(message as string) as
				| Message
				| TypingMessage
				| JoinMessage;
		} catch {
			return;
		}

		/*
			INGRESO DE UN VECINO
		*/
		if (parsed.type === "join") {
			const user = parsed.user.trim().slice(0, 30);

			if (user.length >= 2) {
				connection.setState<ConnectionState>({
					joined: true,
					user,
				});

				/*
					Primero entregamos el historial del día.
				*/
				this.sendHistory(connection);

				/*
					Después actualizamos la lista de vecinos
					para todos los conectados.
				*/
				this.broadcastOnlineUsers();
			}

			return;
		}

		/*
			Una conexión sin nombre confirmado no puede
			participar en el chat.
		*/
		if (
			!(connection.state as ConnectionState | null)
				?.joined
		) {
			return;
		}

		/*
			INDICADOR "ESTÁ ESCRIBIENDO"
		*/
		if (parsed.type === "typing") {
			this.broadcastToJoined(parsed, [connection.id]);
			return;
		}

		/*
			NUEVO MENSAJE / ACTUALIZACIÓN
		*/
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
