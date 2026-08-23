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
};

function App() {
	const [name, setName] = useState("");
	const [nameConfirmed, setNameConfirmed] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [typingUser, setTypingUser] = useState("");
	const { room } = useParams();
	const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const socket = usePartySocket({
		party: "chat",
		room,
		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as
				| Message
				| TypingMessage;

			if (message.type === "typing") {
				if (message.user !== name) {
					setTypingUser(message.user);

					if (typingTimeout.current) {
						clearTimeout(typingTimeout.current);
					}

					typingTimeout.current = setTimeout(() => {
						setTypingUser("");
					}, 2000);
				}

				return;
			}

			if (message.type === "add") {
				const foundIndex = messages.findIndex(
					(m) => m.id === message.id,
				);

				if (foundIndex === -1) {
					setMessages((messages) => [
						...messages,
						{
							id: message.id,
							content: message.content,
							user: message.user,
							role: message.role,
						},
					]);
				} else {
					setMessages((messages) => {
						return messages
							.slice(0, foundIndex)
							.concat({
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							})
							.concat(messages.slice(foundIndex + 1));
					});
				}
			} else if (message.type === "update") {
				setMessages((messages) =>
					messages.map((m) =>
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

	if (!nameConfirmed) {
		return (
			<div className="name-screen">
				<div className="name-box">
					<div className="name-icon">🌿</div>

					<div className="name-welcome">Villa Los Agapantos</div>

					<h2>Bienvenido al chat</h2>

					<p>
						Conversemos entre vecinos y mantengámonos
						conectados como comunidad.
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
							placeholder="¿Cómo te llamas?"
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

	const sendTyping = (isTyping: boolean) => {
		socket.send(
			JSON.stringify({
				type: "typing",
				user: name,
				typing: isTyping,
			}),
		);
	};

	return (
		<div className="chat container">
			<div className="chat-welcome-bar">
				<div>
					<strong>💬 Conversación de vecinos</strong>
					<span>Comparte información y mantente conectado.</span>
				</div>

				<div className="chat-live">
					<span className="online-dot"></span>
					En línea
				</div>
			</div>

			<div className="messages-area">
				{messages.map((message) => {
					const isMine = message.user === name;

					return (
						<div
							key={message.id}
							className={`message ${
								isMine ? "my-message" : "other-message"
							}`}
						>
							<div className="message-meta">
								<span className="message-user">
									{isMine ? "YO" : message.user}
								</span>

								<span className="message-time">
									{new Date().toLocaleTimeString("es-CL", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
							</div>

							<div className="message-bubble">
								{message.content}
							</div>

							{isMine && (
								<div className="message-status">
									✓✓
								</div>
							)}
						</div>
					);
				})}

				{typingUser && (
					<div className="typing-indicator">
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
				)}
			</div>

			<form
				className="chat-form"
				onSubmit={(e) => {
					e.preventDefault();

					const content = e.currentTarget.elements.namedItem(
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

					setMessages((messages) => [...messages, chatMessage]);

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

				<button type="submit" className="send-message">
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
			<Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
			<Route path="/:room" element={<App />} />
			<Route path="/:room" element={<App />} />
			<Route path="*" element={<Navigate to="/" />} />
		</Routes>
	</BrowserRouter>,
);
