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

type HistoryMessage = {
	type: "history";
	messages: ChatMessage[];
};

type ServerMessage =
	| Message
	| TypingMessage
	| OnlineUsersMessage
	| HistoryMessage;

const EMOJIS = [
	"😀",
	"😂",
	"🤣",
	"😊",
	"😍",
	"🥰",
	"😘",
	"😉",
	"😎",
	"🤗",
	"🤔",
	"😮",
	"😢",
	"😭",
	"😡",
	"👍",
	"👎",
	"👏",
	"🙏",
	"❤️",
	"💚",
	"💙",
	"🤣",
	"😂",
	"🎉",
	"🥳",
	"🔥",
	"⭐",
	"🌿",
	"🏡",
	"☀️",
	"🌧️",
	"🌈",
	"☕",
	"🍀",
	"🐶",
	"🐱",
	"🚗",
	"📢",
	"⚠️",
	"✅",
	"❌",
];

function formatTime() {
	return new Date().toLocaleTimeString("es-CL", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function playNotificationSound(
	audioContext: AudioContext | null,
) {
	if (!audioContext) {
		return;
	}

	if (audioContext.state === "suspended") {
		void audioContext.resume();
	}

	const now = audioContext.currentTime;

	const oscillator = audioContext.createOscillator();
	const gain = audioContext.createGain();

	oscillator.type = "sine";

	oscillator.frequency.setValueAtTime(880, now);
	oscillator.frequency.setValueAtTime(1174, now + 0.09);

	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(
		0.08,
		now + 0.02,
	);
	gain.gain.exponentialRampToValueAtTime(
		0.0001,
		now + 0.28,
	);

	oscillator.connect(gain);
	gain.connect(audioContext.destination);

	oscillator.start(now);
	oscillator.stop(now + 0.3);
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
	const [showOnlineUsers, setShowOnlineUsers] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);

	const { room } = useParams();

	const messagesAreaRef = useRef<HTMLDivElement>(null);
	const messageInputRef = useRef<HTMLInputElement>(null);

	const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const onlineNoticeTimeout = useRef<
		ReturnType<typeof setTimeout> | null
	>(null);

	const audioContextRef = useRef<AudioContext | null>(null);

	const currentNameRef = useRef("");

	const onlineUsersRef = useRef<OnlineUser[]>([]);

	const onlineInitializedRef = useRef(false);

	const socket = usePartySocket({
		party: "chat",
		room,

		onMessage: (evt) => {
			const message = JSON.parse(
				evt.data as string,
			) as ServerMessage;

			/* ==========================================
			   HISTORIAL DEL DÍA
			========================================== */

			if (message.type === "history") {
				setMessages(message.messages);

				const times: Record<string, string> = {};

				for (const chatMessage of message.messages) {
					times[chatMessage.id] = formatTime();
				}

				setMessageTimes(times);

				return;
			}

			/* ==========================================
			   USUARIOS EN LÍNEA
			========================================== */

			if (message.type === "online_users") {
				const previousUsers = onlineUsersRef.current;

				const currentUsers = message.users;

				const currentIds = new Set(
					currentUsers.map((user) => user.id),
				);

				const previousIds = new Set(
					previousUsers.map((user) => user.id),
				);

				const newUser = currentUsers.find(
					(user) =>
						!previousIds.has(user.id) &&
						user.user !== currentNameRef.current,
				);

				const disconnectedUser = previousUsers.find(
					(user) => !currentIds.has(user.id),
				);

				if (
					onlineInitializedRef.current &&
					newUser
				) {
					setOnlineNotice(
						`🟢 ${newUser.user} se ha conectado`,
					);

					playNotificationSound(
						audioContextRef.current,
					);

					if (onlineNoticeTimeout.current) {
						clearTimeout(
							onlineNoticeTimeout.current,
						);
					}

					onlineNoticeTimeout.current =
						setTimeout(() => {
							setOnlineNotice("");
						}, 3500);
				}

				if (
					onlineInitializedRef.current &&
					disconnectedUser
				) {
					setOnlineNotice(
						`⚪ ${disconnectedUser.user} se ha desconectado`,
					);

					if (onlineNoticeTimeout.current) {
						clearTimeout(
							onlineNoticeTimeout.current,
						);
					}

					onlineNoticeTimeout.current =
						setTimeout(() => {
							setOnlineNotice("");
						}, 3500);
				}

				onlineUsersRef.current = currentUsers;

				if (!onlineInitializedRef.current) {
					onlineInitializedRef.current = true;
				}

				setOnlineUsers(currentUsers);

				return;
			}

			/* ==========================================
			   ESTÁ ESCRIBIENDO
			========================================== */

			if (message.type === "typing") {
				if (
					message.user !== currentNameRef.current &&
					message.typing
				) {
					setTypingUser(message.user);

					if (typingTimeout.current) {
						clearTimeout(typingTimeout.current);
					}

					typingTimeout.current = setTimeout(() => {
						setTypingUser("");
					}, 2500);
				}

				if (
					message.user !== currentNameRef.current &&
					!message.typing
				) {
					setTypingUser("");
				}

				return;
			}

			/* ==========================================
			   NUEVO MENSAJE
			========================================== */

			if (message.type === "add") {
				setMessages((currentMessages) => {
					const foundIndex =
						currentMessages.findIndex(
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
						.concat(
							currentMessages.slice(
								foundIndex + 1,
							),
						);
				});

				setMessageTimes((times) => ({
					...times,
					[message.id]: formatTime(),
				}));

				setTypingUser("");

				return;
			}

			/* ==========================================
			   ACTUALIZACIÓN
			========================================== */

			if (message.type === "update") {
				setMessages((currentMessages) =>
					currentMessages.map((m) =>
						m.id === message.id
							? {
									id: message.id,
									content:
										message.content,
									user: message.user,
									role: message.role,
								}
							: m,
					),
				);

				return;
			}

			/*
				No mostramos historial enviado por
				versiones antiguas del servidor.
			*/

			if (message.type === "all") {
				return;
			}
		},
	});

	/* ==========================================
	   LIMPIAR TEMPORIZADORES
	========================================== */

	useEffect(() => {
		return () => {
			if (typingTimeout.current) {
				clearTimeout(typingTimeout.current);
			}

			if (onlineNoticeTimeout.current) {
				clearTimeout(onlineNoticeTimeout.current);
			}

			if (audioContextRef.current) {
				void audioContextRef.current.close();
			}
		};
	}, []);

	/* ==========================================
	   BAJAR AL ÚLTIMO MENSAJE
	========================================== */

	useEffect(() => {
		const area = messagesAreaRef.current;

		if (area) {
			area.scrollTop = area.scrollHeight;
		}
	}, [messages, typingUser]);

	/* ==========================================
	   ESTADO DE ESCRITURA
	========================================== */

	const sendTyping = (isTyping: boolean) => {
		if (!currentNameRef.current) {
			return;
		}

		socket.send(
			JSON.stringify({
				type: "typing",
				user: currentNameRef.current,
				typing: isTyping,
			}),
		);
	};

	/* ==========================================
	   INSERTAR EMOJI
	========================================== */

	const insertEmoji = (emoji: string) => {
		const input = messageInputRef.current;

		if (!input) {
			return;
		}

		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;

		const newValue =
			input.value.slice(0, start) +
			emoji +
			input.value.slice(end);

		input.value = newValue;

		const newCursorPosition =
			start + emoji.length;

		input.focus();

		input.setSelectionRange(
			newCursorPosition,
			newCursorPosition,
		);

		setShowEmojiPicker(false);

		sendTyping(true);
	};

	/* ==========================================
	   PANTALLA DE INGRESO
	========================================== */

	if (!nameConfirmed) {
		return (
			<div className="name-screen">
				<div className="name-box">
					<div className="name-icon">
						🌿
					</div>

					<div className="name-welcome">
						Villa Los Agapantos
					</div>

					<h2>Bienvenido al chat</h2>

					<p>
						Para participar en el chat de
						Villa Los Agapantos, indica el
						nombre con el que quieres
						aparecer.
					</p>

					<form
						onSubmit={(e) => {
							e.preventDefault();

							const cleanName =
								name.trim();

							if (
								cleanName.length >= 2
							) {
								const AudioContextClass =
									window.AudioContext ||
									(
										window as typeof window & {
											webkitAudioContext?: typeof AudioContext;
										}
									)
										.webkitAudioContext;

								if (
									AudioContextClass
								) {
									audioContextRef.current =
										new AudioContextClass();

									if (
										audioContextRef
											.current
											.state ===
										"suspended"
									) {
										void audioContextRef.current.resume();
									}
								}

								currentNameRef.current =
									cleanName;

								/*
									Primero limpiamos el estado
									local y después entramos.
								*/
								setMessages([]);
								setMessageTimes({});
								setOnlineUsers([]);
								onlineUsersRef.current = [];
								onlineInitializedRef.current =
									false;

								setName(cleanName);
								setNameConfirmed(true);

								socket.send(
									JSON.stringify({
										type: "join",
										user: cleanName,
									}),
								);
							}
						}}
					>
						<input
							type="text"
							value={name}
							onChange={(e) =>
								setName(
									e.target.value,
								)
							}
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

			{/* ======================================
			    ENCABEZADO
			====================================== */}

			<div className="chat-welcome-bar">
				<div className="chat-welcome-text">
					<strong>
						💬 Conversación de vecinos
					</strong>

					<span>
						Comparte información y
						mantente conectado.
					</span>
				</div>

				<div className="chat-live">
					<button
						type="button"
						className="online-users-button"
						onClick={() =>
							setShowOnlineUsers(
								(current) => !current,
							)
						}
					>
						<span className="online-dot"></span>

						<strong>
							{onlineUsers.length}{" "}
							{onlineUsers.length === 1
								? "vecino"
								: "vecinos"}{" "}
							en línea
						</strong>

						<span className="online-arrow">
							{showOnlineUsers
								? "▲"
								: "▼"}
						</span>
					</button>

					{showOnlineUsers && (
						<div className="online-users-list">
							<div className="online-users-title">
								👥 Vecinos conectados
							</div>

							{onlineUsers.length ===
								0 && (
								<div className="online-user-empty">
									No hay vecinos
									conectados.
								</div>
							)}

							{onlineUsers.map(
								(onlineUser) => (
									<div
										key={
											onlineUser.id
										}
										className="online-user"
									>
										<span className="online-user-dot"></span>

										<span>
											{
												onlineUser.user
											}
										</span>
									</div>
								),
							)}
						</div>
					)}
				</div>
			</div>

			{/* ======================================
			    AVISO DE CONEXIÓN
			====================================== */}

			{onlineNotice && (
				<div className="online-notice">
					{onlineNotice}
				</div>
			)}

			{/* ======================================
			    MENSAJES
			====================================== */}

			<div
				className="messages-area"
				ref={messagesAreaRef}
			>
				{messages.map((message) => {
					const isMine =
						message.user ===
						currentNameRef.current;

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
									{messageTimes[
										message.id
									] ||
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
						<span className="typing-icon">
							✍️
						</span>

						<span className="typing-name">
							{typingUser}
						</span>

						<span>
							está escribiendo
						</span>

						<span className="typing-dots">
							<span>•</span>
							<span>•</span>
							<span>•</span>
						</span>
					</div>
				)}
			</div>

			{/* ======================================
			    CAJA DE ESCRITURA
			====================================== */}

			<form
				className="chat-form"
				onSubmit={(e) => {
					e.preventDefault();

					const content =
						messageInputRef.current;

					if (!content) {
						return;
					}

					const text =
						content.value.trim();

					if (!text) {
						return;
					}

					const chatMessage: ChatMessage = {
						id: nanoid(8),
						content: text,
						user:
							currentNameRef.current,
						role: "user",
					};

					setMessages(
						(currentMessages) => [
							...currentMessages,
							chatMessage,
						],
					);

					setMessageTimes((times) => ({
						...times,
						[chatMessage.id]:
							formatTime(),
					}));

					socket.send(
						JSON.stringify({
							type: "add",
							...chatMessage,
						} satisfies Message),
					);

					sendTyping(false);

					content.value = "";

					setShowEmojiPicker(false);
				}}
			>
				<div className="chat-input-wrapper">
					<button
						type="button"
						className="emoji-button"
						aria-label="Elegir emoji"
						onClick={() =>
							setShowEmojiPicker(
								(current) => !current,
							)
						}
					>
						😀
					</button>

					<input
						ref={messageInputRef}
						type="text"
						name="content"
						className="my-input-text"
						placeholder={`Hola ${currentNameRef.current}, escribe un mensaje...`}
						autoComplete="off"
						onInput={() =>
							sendTyping(true)
						}
					/>

					{showEmojiPicker && (
						<div className="emoji-picker">
							<div className="emoji-picker-title">
								Emojis
							</div>

							<div className="emoji-grid">
								{EMOJIS.map(
									(emoji, index) => (
										<button
											key={`${emoji}-${index}`}
											type="button"
											className="emoji-item"
											onClick={() =>
												insertEmoji(
													emoji,
												)
											}
										>
											{emoji}
										</button>
									),
								)}
							</div>
						</div>
					)}
				</div>

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

createRoot(
	document.getElementById("root")!,
).render(
	<BrowserRouter>
		<Routes>
			<Route
				path="/"
				element={
					<Navigate to="/villa-los-agapantos" />
				}
			/>

			<Route
				path="/:room"
				element={<App />}
			/>

			<Route
				path="*"
				element={
					<Navigate to="/villa-los-agapantos" />
				}
			/>
		</Routes>
	</BrowserRouter>,
);
