import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useEffect, useRef, useState } from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	Navigate,
	useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { type ChatMessage, type Message } from "../shared";

type TypingMessage = {
	type: "typing";
	user: string;
	typing: boolean;
};

function formatTime() {
	return new Date().toLocaleTimeString("es-CL", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function getInitial(name: string) {
	return name.trim().charAt(0).toUpperCase();
}

function App() {
	const [name, setName] = useState("");
	const [nameConfirmed, setNameConfirmed] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [typingUser, setTypingUser] = useState("");
	const [messageTimes, setMessageTimes] = useState<
		Record<string, string>
	>({});

	const { room } = useParams();

	const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const socket = usePartySocket({
		party: "chat",
		room,

		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as
				| Message
				| TypingMessage;

			if (message.type === "typing") {
				if (message.user !== name && message.typing) {
					setTypingUser(message.user);

					if (typingTimeout.current) {
						clearTimeout(typingTimeout.current);
					}

					typingTimeout.current = setTimeout(() => {
						setTypingUser("");
					}, 2500);
				}

				if (message.user !== name && !message.typing) {
					setTypingUser("");
				}

				return;
			}

			if (message.type === "add") {
				setMessages((currentMessages) => {
					const foundIndex = currentMessages.findIndex(
						(m) => m.id === message.id,
					);

					if (foundIndex === -1) {
						return [
							...currentMessages,
							{
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							},
						];
					}

					return currentMessages
						.slice(0, foundIndex)
						.concat({
							id: message.id,
							content: message.content,
							user: message.user,
							role: message.role,
						})
						.concat(currentMessages.slice(foundIndex + 1));
				});

				setMessageTimes((times) => ({
					...times,
					[message.id]: formatTime(),
				}));

				setTypingUser("");
			} else if (message.type === "update") {
				setMessages((currentMessages) =>
					currentMessages.map((m) =>
						m.id === message.id
							? {
									id: message.id,
									content: message.content,
									user: message.user,
									role: message.role,
								}
							: m,
					),
				);
			} else if (message.type === "all") {
				setMessages(message.messages);

				setMessageTimes((times) => {
					const updated = { ...times };

					for (const message of message.messages) {
						if (!updated[message.id]) {
							updated[message.id] = formatTime();
						}
					}

					return updated;
				});
			}
		},
	});

	useEffect(() => {
		return () => {
			if (typingTimeout.current) {
				clearTimeout(typingTimeout.current);
			}
		};
	}, []);

	const sendTyping = (isTyping: boolean) => {
		socket.send(
			JSON.stringify({
				type: "typing",
				user: name,
				typing: isTyping,
			}),
		);
	};

	if (!nameConfirmed) {
		return (
			<div className="name-screen">
				<div className="name-box">
					<div className="name-icon">🌿</div>

					<div className="name-welcome">
						Villa Los Agapantos
					</div>

					<h2>Bienvenido al chat</h2>

					<p>
						Un espacio para conversar, compartir
						información y mantenernos conectados
						como comunidad.
					</p>

					<form
						onSubmit={(e) => {
							e.preventDefault();

							const cleanName = name.trim();

							if (cleanName.length >= 2) {
								setName(cleanName);
								setNameConfirmed(true);
							}
						}}
					>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Escribe tu nombre"
							autoComplete="name"
							autoFocus
							maxLength={30}
						/>

						<button type="submit">
							Entrar al chat
						</button>
					</form>
				</div>
			</div>
		);
	}

	return (
		<div className="chat container">

			<header className="chat-top">
				<div className="chat-top-left">
					<div className="chat-main-icon">🌿</div>

					<div>
						<h1>Chat de Vecinos</h1>
						<p>Villa Los Agapantos</p>
					</div>
				</div>

				<div className="chat-online">
					<span className="online-dot"></span>
					<span>En línea</span>
				</div>
			</header>

			<div className="chat-notice">
				<div className="notice-icon">💬</div>

				<div>
					<strong>Conversemos entre vecinos</strong>
					<span>
						Comparte información y mantente conectado
						con tu comunidad.
					</span>
				</div>
			</div>

			<div className="messages-area">

				{messages.map((message) => {
					const isMine = message.user === name;

					return (
						<div
							key={message.id}
							className={`message-row ${
								isMine
									? "message-row-mine"
									: "message-row-other"
							}`}
						>
							{!isMine && (
								<div className="avatar avatar-other">
									{getInitial(message.user)}
								</div>
							)}

							<div className="message-content">

								<div className="message-author">
									{isMine ? "YO" : message.user}
								</div>

								<div
									className={`message-bubble ${
										isMine
											? "bubble-mine"
											: "bubble-other"
									}`}
								>
									{message.content}
								</div>

								<div className="message-info">
									<span>
										{messageTimes[message.id] ||
											formatTime()}
									</span>

									{isMine && (
										<span className="message-check">
											✓✓
										</span>
									)}
								</div>

							</div>

							{isMine && (
								<div className="avatar avatar-mine">
									{getInitial(name)}
								</div>
							)}
						</div>
					);
				})}

				{typingUser && (
					<div className="typing-row">
						<div className="typing-avatar">
							{getInitial(typingUser)}
						</div>

						<div className="typing-box">
							<span className="typing-name">
								{typingUser}
							</span>

							<span>está escribiendo</span>

							<span className="typing-dots">
								<span>•</span>
								<span>•</span>
								<span>•</span>
							</span>
						</div>
					</div>
				)}

			</div>

			<form
				className="chat-form"
				onSubmit={(e) => {
					e.preventDefault();

					const content =
						e.currentTarget.elements.namedItem(
							"content",
						) as HTMLInputElement;

					const text = content.value.trim();

					if (!text) {
						return;
					}

					const chatMessage: ChatMessage = {
						id: nanoid(8),
						content: text,
						user: name,
						role: "user",
					};

					setMessages((currentMessages) => [
						...currentMessages,
						chatMessage,
					]);

					setMessageTimes((times) => ({
						...times,
						[chatMessage.id]: formatTime(),
					}));

					socket.send(
						JSON.stringify({
							type: "add",
							...chatMessage,
						} satisfies Message),
					);

					sendTyping(false);

					content.value = "";
				}}
			>
				<div className="input-wrapper">
					<input
						type="text"
						name="content"
						className="my-input-text"
						placeholder="Escribe un mensaje..."
						autoComplete="off"
						onInput={() => sendTyping(true)}
					/>
				</div>

				<button
					type="submit"
					className="send-message"
				>
					Enviar
				</button>
			</form>

			<div className="chat-security">
				🔒 Chat de la comunidad · Villa Los Agapantos
			</div>

		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Routes>
			<Route
				path="/"
				element={<Navigate to={`/${nanoid()}`} />}
			/>

			<Route
				path="/:room"
				element={<App />}
			/>

			<Route
				path="*"
				element={<Navigate to="/" />}
			/>
		</Routes>
	</BrowserRouter>,
);
