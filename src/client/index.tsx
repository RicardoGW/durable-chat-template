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

type OnlineUser = {
	id: string;
	user: string;
};

type OnlineUsersMessage = {
	type: "online_users";
	users: OnlineUser[];
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
	const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
	const [onlineNotice, setOnlineNotice] = useState("");

	const { room } = useParams();

	const messagesAreaRef = useRef<HTMLDivElement>(null);

	const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const onlineNoticeTimeout = useRef<
		ReturnType<typeof setTimeout> | null
	>(null);

	const audioContextRef = useRef<AudioContext | null>(null);

	const socket = usePartySocket({
		party: "chat",
		room,

		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as
				| Message
				| TypingMessage
				| OnlineUsersMessage;

			/* USUARIOS EN LÍNEA */

			if (message.type === "online_users") {
				setOnlineUsers((previousUsers) => {
					const previousIds = new Set(
						previousUsers.map((user) => user.id),
					);

					const currentIds = new Set(
						message.users.map((user) => user.id),
					);

					const newUser = message.users.find(
						(user) =>
							!previousIds.has(user.id) &&
							user.user !== name,
					);

					const disconnectedUser = previousUsers.find(
						(user) => !currentIds.has(user.id),
					);

					if (newUser && nameConfirmed) {
						setOnlineNotice(
							`🟢 ${newUser.user} se ha conectado`,
						);

						if (onlineNoticeTimeout.current) {
							clearTimeout(
								onlineNoticeTimeout.current,
							);
						}

						onlineNoticeTimeout.current = setTimeout(() => {
							setOnlineNotice("");
						}, 3500);

						/* SONIDO DE NOTIFICACIÓN */

						if (audioContextRef.current) {
							const audioContext =
								audioContextRef.current;

							if (audioContext.state === "suspended") {
								audioContext.resume();
							}

							const oscillator =
								audioContext.createOscillator();

							const gain =
								audioContext.createGain();

							oscillator.type = "sine";

							oscillator.frequency.setValueAtTime(
								880,
								audioContext.currentTime,
							);

							oscillator.frequency.setValueAtTime(
								1174,
								audioContext.currentTime + 0.08,
							);

							gain.gain.setValueAtTime(
								0.0001,
								audioContext.currentTime,
							);

							gain.gain.exponentialRampToValueAtTime(
								0.08,
								audioContext.currentTime + 0.02,
							);

							gain.gain.exponentialRampToValueAtTime(
								0.0001,
								audioContext.currentTime + 0.22,
							);

							oscillator.connect(gain);
							gain.connect(
								audioContext.destination,
							);

							oscillator.start();

							oscillator.stop(
								audioContext.currentTime + 0.25,
							);
						}
					}

					if (disconnectedUser && nameConfirmed) {
						setOnlineNotice(
							`⚪ ${disconnectedUser.user} se ha desconectado`,
						);

						if (onlineNoticeTimeout.current) {
							clearTimeout(
								onlineNoticeTimeout.current,
							);
						}

						onlineNoticeTimeout.current = setTimeout(() => {
							setOnlineNotice("");
						}, 3500);
					}

					return message.users;
				});

				return;
			}

			/* INDICADOR "ESTÁ ESCRIBIENDO" */

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

			/* NUEVO MENSAJE */

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

				return;
			}

			/* ACTUALIZACIÓN */

			if (message.type === "update") {
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

				return;
			}

			/* Nunca mostrar historial recibido por una versión antigua del servidor. */

			if (message.type === "all") {
				return;
			}
		},
	});

	/* LIMPIAR TEMPORIZADORES */

	useEffect(() => {
		return () => {
			if (typingTimeout.current) {
				clearTimeout(typingTimeout.current);
			}

			if (onlineNoticeTimeout.current) {
				clearTimeout(onlineNoticeTimeout.current);
			}
		};
	}, []);

	/* BAJAR AUTOMÁTICAMENTE AL ÚLTIMO MENSAJE */

	useEffect(() => {
		const area = messagesAreaRef.current;

		if (area) {
			area.scrollTop = area.scrollHeight;
		}
	}, [messages, typingUser]);

	/* ENVIAR ESTADO DE ESCRITURA */

	const sendTyping = (isTyping: boolean) => {
		if (!name) {
			return;
		}

		socket.send(
			JSON.stringify({
				type: "typing",
				user: name,
				typing: isTyping,
			}),
		);
	};

	/* PANTALLA DE INGRESO */

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
						Para participar en el chat de Villa Los Agapantos,
						indica el nombre con el que quieres aparecer.
					</p>

					<form
						onSubmit={(e) => {
							e.preventDefault();

							const cleanName = name.trim();

							if (cleanName.length >= 2) {
								/* Activar sonido después de la interacción del usuario. */

								const AudioContextClass =
									window.AudioContext ||
									(window as typeof window & {
										webkitAudioContext?: typeof AudioContext;
									}).webkitAudioContext;

								if (AudioContextClass) {
									audioContextRef.current =
										new AudioContextClass();

									if (
										audioContextRef.current
											.state === "suspended"
									) {
										audioContextRef.current.resume();
									}
								}

								/* Registra esta conexión sin solicitar historial. */

								socket.send(
									JSON.stringify({
										type: "join",
										user: cleanName,
									}),
								);

								setMessages([]);
								setMessageTimes({});
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

			{/* ENCABEZADO */}

			<div className="chat-welcome-bar">
				<div className="chat-welcome-text">
					<strong>💬 Conversación de vecinos</strong>

					<span>
						Comparte información y mantente conectado.
					</span>
				</div>

				<div className="chat-live">
					<span className="online-dot"></span>

					<div className="online-users">
						<strong>
							{onlineUsers.length}{" "}
							{onlineUsers.length === 1
								? "vecino"
								: "vecinos"}{" "}
							en línea
						</strong>

						{onlineUsers.length > 0 && (
							<div className="online-users-list">
								{onlineUsers.map((onlineUser) => (
									<div
										key={onlineUser.id}
										className="online-user"
									>
										<span className="online-user-dot"></span>

										<span>
											{onlineUser.user}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* AVISO DE CONEXIÓN */}

			{onlineNotice && (
				<div className="online-notice">
					{onlineNotice}
				</div>
			)}

			{/* MENSAJES */}

			<div
				className="messages-area"
				ref={messagesAreaRef}
			>
				{messages.map((message) => {
					const isMine = message.user === name;

					return (
						<div
							key={message.id}
							className={`message ${
								isMine
									? "my-message"
									: "other-message"
							}`}
						>
							<div className="message-meta">
								<span className="message-user">
									{isMine
										? "YO"
										: message.user}
								</span>

								<span className="message-time">
									{messageTimes[message.id] ||
										formatTime()}
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

				{/* ESTÁ ESCRIBIENDO */}

				{typingUser && (
					<div className="typing-indicator">
						<span className="typing-icon">✍️</span>

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

			{/* CAJA DE ESCRITURA */}

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
				<input
					type="text"
					name="content"
					className="my-input-text"
					placeholder={`Hola ${name}, escribe un mensaje...`}
					autoComplete="off"
					onInput={() => sendTyping(true)}
				/>

				<button
					type="submit"
					className="send-message"
				>
					Enviar
				</button>
			</form>

			<div className="chat-security">
				🌿 Comunidad • Seguridad • Convivencia
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
