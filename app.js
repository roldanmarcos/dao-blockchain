import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";

const CONFIG = {
  chainId: 11155111n,
  chainName: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  studentSBT: "0xB5F037B12436D2e3f44dfe433752f1Ae12bF6677",
  unqToken: "0x039D4bD858d7Ce1fD666654dc74EA12136A97A8A",
  dao: "0x28BB2aD9670aD0c18b36f9A1714Ad7C0b1410919",
  tokenDecimals: 18,
  proposalHistoryLimit: 50,
  maxDurationMinutes: 525600
};

const SBT_ABI = [
  "function owner() view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mint(address alumno)"
];
const TOKEN_ABI = [
  "function owner() view returns (address)",
  "function faucets(address) view returns (bool)",
  "function studentSBT() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function mint(address alumno, uint256 cantidad)"
];
const DAO_ABI = [
  "function proposalCount() view returns (uint256)",
  "function createProposal(string descriptionHash, uint256 durationInMinutes) returns (uint256)",
  "function vote(uint256 proposalId, bool support)",
  "function executeProposal(uint256 proposalId)",
  "function getProposal(uint256 proposalId) view returns (uint256 id, address proposer, string descriptionHash, uint256 votesFor, uint256 votesAgainst, uint256 startTime, uint256 endTime, bool executed, bool approved)",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function studentSBT() view returns (address)",
  "function unqToken() view returns (address)"
];

const el = (id) => document.getElementById(id);
const state = { provider: null, signer: null, account: null, sbt: null, token: null, dao: null, isSepolia: false, isSbtOwner: false, canMintToken: false, studentBalance: 0n, tokenBalance: 0n, refreshTimer: null, refreshing: false };

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

function setFeedback(target, message, kind = "") {
  target.textContent = message;
  target.className = `form-feedback${kind ? ` feedback-${kind}` : ""}`;
}

function setNotice(message, kind = "info") {
  const notice = el("globalNotice");
  notice.textContent = message;
  notice.className = `notice notice-${kind}`;
  notice.hidden = false;
}

function clearNotice() {
  el("globalNotice").hidden = true;
}

function showWalletStatus(message) {
  el("walletStatus").textContent = message;
}

function normalizeAddress(value) {
  const address = value.trim();
  if (!ethers.isAddress(address)) throw new Error("Ingresá una dirección Ethereum válida (0x y 40 caracteres). ");
  return ethers.getAddress(address);
}

function parseWholeNumber(value, label, { min = 1, max } = {}) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label}: ingresá un número entero, sin decimales.`);
  const number = BigInt(text);
  if (number < BigInt(min)) throw new Error(`${label}: el mínimo es ${min}.`);
  if (max !== undefined && number > BigInt(max)) throw new Error(`${label}: el máximo es ${max}.`);
  return number;
}

function friendlyError(error) {
  if (error?.code === "ACTION_REJECTED" || error?.code === 4001) return "Cancelaste la operación en MetaMask.";
  if (error?.reason) return error.reason;
  const message = error?.shortMessage || error?.info?.error?.message || error?.message || "Ocurrió un error.";
  if (/insufficient funds/i.test(message)) return "A esta wallet le falta Sepolia ETH para pagar el gas.";
  if (/wrong network|chain/i.test(message)) return "Cambiá la wallet a la red Sepolia.";
  if (/SBT:|UNQC:|DAO:/i.test(message)) return message.slice(message.indexOf("SBT:") >= 0 ? message.indexOf("SBT:") : message.indexOf("UNQC:") >= 0 ? message.indexOf("UNQC:") : message.indexOf("DAO:"));
  return message.length > 170 ? `${message.slice(0, 167)}…` : message;
}

async function makeContracts() {
  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.account = ethers.getAddress(await state.signer.getAddress());
  const network = await state.provider.getNetwork();
  state.isSepolia = network.chainId === CONFIG.chainId;
  el("networkNotice").hidden = state.isSepolia;
  if (!state.isSepolia) {
    el("networkNotice").textContent = "Estás conectada a otra red. Cambiá MetaMask a Sepolia para usar esta DApp.";
    state.sbt = state.token = state.dao = null;
    setAllActionsEnabled(false);
    return;
  }
  state.sbt = new ethers.Contract(CONFIG.studentSBT, SBT_ABI, state.signer);
  state.token = new ethers.Contract(CONFIG.unqToken, TOKEN_ABI, state.signer);
  state.dao = new ethers.Contract(CONFIG.dao, DAO_ABI, state.signer);
  const [sbtCode, tokenCode, daoCode] = await Promise.all([
    state.provider.getCode(CONFIG.studentSBT),
    state.provider.getCode(CONFIG.unqToken),
    state.provider.getCode(CONFIG.dao)
  ]);
  if (sbtCode === "0x" || tokenCode === "0x" || daoCode === "0x") throw new Error("No se encontró uno de los contratos en Sepolia. Revisá las direcciones configuradas en app.js.");
}

function setAllActionsEnabled(enabled) {
  document.querySelectorAll("#dashboard button, #dashboard input").forEach((control) => { control.disabled = !enabled; });
}

async function connectWallet() {
  clearNotice();
  if (!window.ethereum) {
    setNotice("No encontramos una wallet compatible. Abrí esta DApp en un navegador con MetaMask instalado.", "error");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await makeContracts();
    el("dashboard").hidden = false;
    el("connectButton").textContent = shortAddress(state.account);
    el("heroConnectButton").hidden = true;
    el("refreshButton").hidden = false;
    el("connectedAccount").textContent = `Wallet conectada: ${state.account}`;
    if (!state.isSepolia) {
      showWalletStatus("Wallet conectada, pero la red seleccionada no es Sepolia.");
      return;
    }
    showWalletStatus("Wallet conectada a Sepolia. Consultando tus datos…");
    await refreshDashboard();
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") refreshDashboard();
    }, 15000);
  } catch (error) {
    setNotice(friendlyError(error), "error");
    showWalletStatus("No se pudo conectar la wallet.");
  }
}

function setActionAvailability() {
  const ready = Boolean(state.account && state.isSepolia && state.sbt && state.token && state.dao);
  document.querySelectorAll("#dashboard button, #dashboard input").forEach((control) => { control.disabled = !ready; });
  if (!ready) return;
  el("createProposalButton").disabled = state.studentBalance === 0n;
  el("proposalPermission").textContent = state.studentBalance > 0n ? "Tu credencial permite proponer" : "Requiere credencial SBT";
  el("proposalPermission").classList.toggle("permission-ready", state.studentBalance > 0n);
  el("adminSection").hidden = !(state.isSbtOwner || state.canMintToken);
  el("mintSbtForm").hidden = !state.isSbtOwner;
  el("mintTokenForm").hidden = !state.canMintToken;
}

function formatTokenBalance(raw) {
  const formatted = ethers.formatUnits(raw, CONFIG.tokenDecimals);
  return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
}

async function refreshDashboard() {
  if (!state.account || !state.isSepolia || !state.sbt || !state.token || !state.dao || state.refreshing) return;
  state.refreshing = true;
  try {
    const [studentBalance, rawTokenBalance, sbtOwner, tokenOwner, faucetRole, block, proposalCount] = await Promise.all([
      state.sbt.balanceOf(state.account),
      state.token.balanceOf(state.account),
      state.sbt.owner(),
      state.token.owner(),
      state.token.faucets(state.account),
      state.provider.getBlock("latest"),
      state.dao.proposalCount()
    ]);
    state.studentBalance = studentBalance;
    state.tokenBalance = rawTokenBalance;
    state.isSbtOwner = state.account.toLowerCase() === sbtOwner.toLowerCase();
    state.canMintToken = state.account.toLowerCase() === tokenOwner.toLowerCase() || faucetRole;
    el("credentialValue").textContent = studentBalance > 0n ? "Activa" : "No emitida";
    el("credentialHint").textContent = studentBalance > 0n ? `${studentBalance.toString()} credencial${studentBalance === 1n ? "" : "es"} en esta wallet` : "Solicitá la emisión a la universidad";
    el("tokenBalance").textContent = `${formatTokenBalance(rawTokenBalance)} UNQC`;
    el("votingPower").textContent = `${(rawTokenBalance / (10n ** BigInt(CONFIG.tokenDecimals))).toString()} votos`;
    el("roleChip").textContent = state.isSbtOwner && state.canMintToken ? "Universidad · Owner" : state.canMintToken ? "Faucet autorizado" : studentBalance > 0n ? "Estudiante UNQ" : "Wallet conectada";
    showWalletStatus(`Conectada a Sepolia · ${shortAddress(state.account)}`);
    setActionAvailability();
    await loadProposals(proposalCount, block?.timestamp ?? Math.floor(Date.now() / 1000));
  } catch (error) {
    setNotice(`No pudimos leer los contratos: ${friendlyError(error)}`, "error");
  } finally {
    state.refreshing = false;
  }
}

async function loadProposals(count, now) {
  const list = el("proposalList");
  list.replaceChildren();
  const total = Number(count);
  el("proposalCountLabel").textContent = `${total} ${total === 1 ? "propuesta" : "propuestas"}`;
  if (total === 0) {
    el("emptyProposals").hidden = false;
    return;
  }
  el("emptyProposals").hidden = true;
  const firstId = Math.max(1, total - CONFIG.proposalHistoryLimit + 1);
  const ids = Array.from({ length: total - firstId + 1 }, (_, index) => firstId + index);
  const proposals = await Promise.all(ids.map(async (id) => {
    const [data, hasVoted] = await Promise.all([state.dao.getProposal(id), state.dao.hasVoted(id, state.account)]);
    return { id, data, hasVoted };
  }));
  proposals.reverse().forEach(({ id, data, hasVoted }) => list.appendChild(renderProposal(id, data, hasVoted, now)));
}

function renderProposal(id, data, hasVoted, now) {
  const card = el("proposalTemplate").content.firstElementChild.cloneNode(true);
  const [proposalId, proposer, uri, votesFor, votesAgainst, startTime, endTime, executed, approved] = data;
  const forCount = BigInt(votesFor);
  const againstCount = BigInt(votesAgainst);
  const totalVotes = forCount + againstCount;
  const percentFor = totalVotes === 0n ? 0 : Number((forCount * 100n) / totalVotes);
  const start = Number(startTime);
  const end = Number(endTime);
  const active = now >= start && now <= end;
  const expired = now > end;

  card.querySelector(".proposal-id").textContent = `Propuesta #${id}`;
  card.querySelector(".proposal-title").textContent = uri;
  const link = card.querySelector(".proposal-link");
  if (/^https:\/\//i.test(uri)) {
    link.href = uri;
    link.textContent = "Abrir detalle de la propuesta ↗";
    link.hidden = false;
  } else if (/^ipfs:\/\//i.test(uri)) {
    link.href = `https://ipfs.io/ipfs/${encodeURIComponent(uri.slice(7))}`;
    link.textContent = "Abrir contenido IPFS ↗";
    link.hidden = false;
  }
  card.querySelector(".votes-for").textContent = forCount.toString();
  card.querySelector(".votes-against").textContent = againstCount.toString();
  card.querySelector(".vote-track-for").style.width = `${percentFor}%`;
  card.querySelector(".proposal-time").textContent = executed ? `Cerró: ${new Date(end * 1000).toLocaleString("es-AR")}` : active ? `Cierra: ${new Date(end * 1000).toLocaleString("es-AR")}` : `Finalizó: ${new Date(end * 1000).toLocaleString("es-AR")}`;
  card.querySelector(".proposal-proposer").textContent = `Por ${shortAddress(proposer)}`;

  const status = card.querySelector(".proposal-status");
  if (executed) {
    status.textContent = approved ? "Aprobada" : "No aprobada";
    status.classList.add(approved ? "status-approved" : "status-rejected");
  } else if (active) {
    status.textContent = "En votación";
  } else {
    status.textContent = "Pendiente de cierre";
    status.classList.add("status-ended");
  }

  const actions = card.querySelector(".proposal-actions");
  if (active && !hasVoted && state.studentBalance > 0n && state.tokenBalance / (10n ** BigInt(CONFIG.tokenDecimals)) > 0n) {
    const weight = (state.tokenBalance / (10n ** BigInt(CONFIG.tokenDecimals))).toString();
    const yes = makeButton(`A favor · ${weight}`, "button-for", () => submitVote(id, true));
    const no = makeButton(`En contra · ${weight}`, "button-against", () => submitVote(id, false));
    actions.append(yes, no);
  } else if (active && hasVoted) {
    actions.appendChild(makeActionNote("Ya votaste en esta propuesta."));
  } else if (active && state.studentBalance === 0n) {
    actions.appendChild(makeActionNote("Necesitás una credencial SBT para votar."));
  } else if (active) {
    actions.appendChild(makeActionNote("Necesitás al menos 1 UNQC para votar."));
  } else if (expired && !executed) {
    actions.appendChild(makeButton("Cerrar votación", "button-close", () => submitExecution(id)));
  } else {
    actions.appendChild(makeActionNote(executed ? "Resultado registrado en la DAO." : "La votación todavía no empezó."));
  }
  return card;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.className = `button ${className}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeActionNote(message) {
  const note = document.createElement("span");
  note.className = "action-note";
  note.textContent = message;
  return note;
}

async function sendTransaction(action, feedbackElement, pendingText, successText) {
  clearNotice();
  setFeedback(feedbackElement, pendingText);
  try {
    const tx = await action();
    setFeedback(feedbackElement, "Transacción enviada. Esperando confirmación…");
    await tx.wait();
    setFeedback(feedbackElement, successText, "success");
    setNotice(successText, "success");
    await refreshDashboard();
  } catch (error) {
    const message = friendlyError(error);
    setFeedback(feedbackElement, message, "error");
    setNotice(message, "error");
  }
}

async function submitSbtMint(event) {
  event.preventDefault();
  const feedback = el("sbtFeedback");
  try {
    const recipient = normalizeAddress(el("sbtRecipient").value);
    const existing = await state.sbt.balanceOf(recipient);
    if (existing > 0n) throw new Error("Esa wallet ya tiene una credencial SBT.");
    await sendTransaction(() => state.sbt.mint(recipient), feedback, "Confirmá la emisión en MetaMask…", "Credencial SBT emitida.");
    if (feedback.classList.contains("feedback-success")) el("mintSbtForm").reset();
  } catch (error) {
    setFeedback(feedback, friendlyError(error), "error");
  }
}

async function submitTokenMint(event) {
  event.preventDefault();
  const feedback = el("tokenFeedback");
  try {
    const recipient = normalizeAddress(el("tokenRecipient").value);
    const amount = parseWholeNumber(el("tokenAmount").value, "Cantidad de UNQC", { min: 1, max: 1000000000 });
    const credential = await state.sbt.balanceOf(recipient);
    if (credential === 0n) throw new Error("Esa wallet todavía no tiene SBT. Emití primero su credencial.");
    await sendTransaction(() => state.token.mint(recipient, amount), feedback, "Confirmá la asignación en MetaMask…", `${amount} UNQC asignados correctamente.`);
    if (feedback.classList.contains("feedback-success")) el("mintTokenForm").reset();
  } catch (error) {
    setFeedback(feedback, friendlyError(error), "error");
  }
}

function validateProposalUri(value) {
  const uri = value.trim();
  if (!uri) throw new Error("Ingresá el enlace o URI del detalle.");
  if (uri.length > 512) throw new Error("El enlace no puede superar 512 caracteres.");
  if (/^ipfs:\/\//i.test(uri)) {
    if (uri.slice(7).trim().length === 0) throw new Error("Completá el identificador después de ipfs://.");
    return uri;
  }
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:") throw new Error();
    return uri;
  } catch {
    throw new Error("Usá una URI ipfs://… o un enlace https://… válido.");
  }
}

async function submitProposal(event) {
  event.preventDefault();
  const feedback = el("proposalFeedback");
  try {
    if (state.studentBalance === 0n) throw new Error("Necesitás una credencial SBT para crear propuestas.");
    const uri = validateProposalUri(el("proposalUri").value);
    const duration = parseWholeNumber(el("proposalDuration").value, "Duración", { min: 1, max: CONFIG.maxDurationMinutes });
    await sendTransaction(() => state.dao.createProposal(uri, duration), feedback, "Confirmá la creación en MetaMask…", "Propuesta creada.");
    if (feedback.classList.contains("feedback-success")) el("createProposalForm").reset();
  } catch (error) {
    setFeedback(feedback, friendlyError(error), "error");
  }
}

async function submitVote(proposalId, support) {
  const side = support ? "a favor" : "en contra";
  setNotice(`Confirmá tu voto ${side} para la propuesta #${proposalId} en MetaMask.`, "info");
  try {
    const tx = await state.dao.vote(proposalId, support);
    setNotice("Voto enviado. Esperando confirmación…", "info");
    await tx.wait();
    setNotice(`Voto ${side} registrado en la propuesta #${proposalId}.`, "success");
    await refreshDashboard();
  } catch (error) {
    setNotice(friendlyError(error), "error");
  }
}

async function submitExecution(proposalId) {
  setNotice(`Confirmá el cierre de la propuesta #${proposalId} en MetaMask.`, "info");
  try {
    const tx = await state.dao.executeProposal(proposalId);
    setNotice("Cierre enviado. Esperando confirmación…", "info");
    await tx.wait();
    setNotice(`Propuesta #${proposalId} cerrada. El resultado quedó guardado en la DAO.`, "success");
    await refreshDashboard();
  } catch (error) {
    setNotice(friendlyError(error), "error");
  }
}

el("connectButton").addEventListener("click", connectWallet);
el("heroConnectButton").addEventListener("click", connectWallet);
el("refreshButton").addEventListener("click", refreshDashboard);
el("mintSbtForm").addEventListener("submit", submitSbtMint);
el("mintTokenForm").addEventListener("submit", submitTokenMint);
el("createProposalForm").addEventListener("submit", submitProposal);

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", async (accounts) => {
    if (!accounts.length) {
      window.location.reload();
      return;
    }
    try {
      await makeContracts();
      el("connectedAccount").textContent = `Wallet conectada: ${state.account}`;
      el("connectButton").textContent = shortAddress(state.account);
      await refreshDashboard();
    } catch (error) {
      setNotice(friendlyError(error), "error");
    }
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}

if (window.ethereum) {
  el("connectButton").disabled = false;
} else {
  showWalletStatus("Abrí esta página en un navegador con MetaMask instalado.");
}
