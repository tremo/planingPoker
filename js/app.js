// ============================================
// Planning Poker - P2P with PeerJS
// ============================================

const DECKS = {
    fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '\u2615'],
    tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '\u2615']
};

const PEER_PREFIX = 'planpoker-';
const CONNECT_TIMEOUT = 15000; // 15 saniye
const MAX_RETRIES = 3;

// ICE sunucuları - NAT/firewall arkasındaki bağlantılar için
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

// ============================================
// APP STATE
// ============================================

const state = {
    peer: null,
    peerId: null,
    isHost: false,
    userName: null,
    roomCode: null,
    selectedCard: null,
    deck: 'fibonacci',
    connections: {},
    gameState: null,
    hostConnection: null,
    localState: null
};

// ============================================
// UTILITY
// ============================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function roomCodeToPeerId(code) {
    return PEER_PREFIX + code.toLowerCase();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function setConnectionStatus(text, ok) {
    const el = document.getElementById('connection-status');
    el.textContent = text;
    el.className = 'connection-badge ' + (ok ? 'connected' : 'disconnected');
}

function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Bağlanıyor...';
        btn.disabled = true;
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
        btn.disabled = false;
    }
}

function createPeer(peerId) {
    const config = {
        debug: 1,
        config: {
            iceServers: ICE_SERVERS
        }
    };
    if (peerId) {
        return new Peer(peerId, config);
    }
    return new Peer(config);
}

// ============================================
// LOBBY UI
// ============================================

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

document.querySelectorAll('.deck-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.deck-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.deck = btn.dataset.deck;
    });
});

// ============================================
// CREATE ROOM (HOST)
// ============================================

document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('create-name').value.trim();
    const roomName = document.getElementById('create-room-name').value.trim();

    if (!name) { showToast('Lütfen adınızı girin', 'error'); return; }
    if (!roomName) { showToast('Lütfen oda adı girin', 'error'); return; }

    setButtonLoading('btn-create', true);

    const roomCode = generateRoomCode();
    const peerId = roomCodeToPeerId(roomCode);

    state.isHost = true;
    state.userName = name;
    state.roomCode = roomCode;

    state.gameState = {
        name: roomName,
        deck: state.deck,
        story: '',
        revealed: false,
        players: {}
    };

    state.gameState.players[peerId] = {
        name: name,
        vote: null,
        isHost: true
    };

    // Timeout for peer creation
    const timeout = setTimeout(() => {
        setButtonLoading('btn-create', false);
        showToast('Sunucuya bağlanılamadı. Tekrar deneyin.', 'error');
        if (state.peer) { state.peer.destroy(); state.peer = null; }
    }, CONNECT_TIMEOUT);

    state.peer = createPeer(peerId);

    state.peer.on('open', (id) => {
        clearTimeout(timeout);
        setButtonLoading('btn-create', false);
        state.peerId = id;
        window.location.hash = roomCode;
        enterRoom();
        setConnectionStatus('Bağlı (Host)', true);
        showToast('Oda oluşturuldu!', 'success');
        console.log('[HOST] Oda oluşturuldu, PeerID:', id);
    });

    state.peer.on('connection', (conn) => {
        console.log('[HOST] Yeni bağlantı geliyor:', conn.peer);
        handleNewConnection(conn);
    });

    state.peer.on('error', (err) => {
        clearTimeout(timeout);
        setButtonLoading('btn-create', false);
        console.error('[HOST] Peer hatası:', err.type, err.message);
        if (err.type === 'unavailable-id') {
            showToast('Bu oda kodu kullanımda, tekrar deneyin', 'error');
        } else {
            showToast('Bağlantı hatası: ' + err.type, 'error');
        }
    });

    state.peer.on('disconnected', () => {
        console.log('[HOST] Signaling sunucusundan koptu, yeniden bağlanıyor...');
        setConnectionStatus('Yeniden bağlanıyor...', false);
        if (state.peer && !state.peer.destroyed) {
            state.peer.reconnect();
        }
    });
});

// ============================================
// JOIN ROOM (GUEST)
// ============================================

document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('join-name').value.trim();
    const roomCode = document.getElementById('join-room-id').value.trim().toUpperCase();

    if (!name) { showToast('Lütfen adınızı girin', 'error'); return; }
    if (!roomCode || roomCode.length !== 6) { showToast('Geçerli bir oda kodu girin', 'error'); return; }

    state.isHost = false;
    state.userName = name;
    state.roomCode = roomCode;

    connectToHost(name, roomCode, 0);
});

function connectToHost(name, roomCode, attempt) {
    setButtonLoading('btn-join', true);

    if (state.peer && !state.peer.destroyed) {
        state.peer.destroy();
    }

    const hostPeerId = roomCodeToPeerId(roomCode);

    console.log(`[JOIN] Deneme ${attempt + 1}/${MAX_RETRIES}, Host: ${hostPeerId}`);

    // Timeout
    const timeout = setTimeout(() => {
        console.log('[JOIN] Timeout!');
        if (attempt < MAX_RETRIES - 1) {
            showToast(`Bağlantı zaman aşımı. Tekrar deneniyor... (${attempt + 2}/${MAX_RETRIES})`, 'error');
            connectToHost(name, roomCode, attempt + 1);
        } else {
            setButtonLoading('btn-join', false);
            showToast('Odaya bağlanılamadı. Host çevrimiçi mi?', 'error');
            if (state.peer) { state.peer.destroy(); state.peer = null; }
        }
    }, CONNECT_TIMEOUT);

    state.peer = createPeer(null);

    state.peer.on('open', (id) => {
        state.peerId = id;
        console.log('[JOIN] Peer açıldı:', id, '→ Host\'a bağlanılıyor...');

        const conn = state.peer.connect(hostPeerId, {
            reliable: true,
            serialization: 'json'
        });
        state.hostConnection = conn;

        conn.on('open', () => {
            clearTimeout(timeout);
            setButtonLoading('btn-join', false);
            console.log('[JOIN] Bağlantı kuruldu!');
            conn.send({ type: 'join', name: name, peerId: id });
            window.location.hash = roomCode;
            enterRoom();
            setConnectionStatus('Bağlı', true);
            showToast('Odaya katıldınız!', 'success');
        });

        conn.on('data', (data) => {
            handleGuestMessage(data);
        });

        conn.on('close', () => {
            setConnectionStatus('Bağlantı koptu', false);
            showToast('Host bağlantısı koptu', 'error');
        });

        conn.on('error', (err) => {
            console.error('[JOIN] Connection error:', err);
        });
    });

    state.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[JOIN] Peer hatası:', err.type, err.message);

        if (err.type === 'peer-unavailable') {
            if (attempt < MAX_RETRIES - 1) {
                showToast(`Oda bulunamadı, tekrar deneniyor... (${attempt + 2}/${MAX_RETRIES})`, 'error');
                setTimeout(() => connectToHost(name, roomCode, attempt + 1), 1500);
            } else {
                setButtonLoading('btn-join', false);
                showToast('Oda bulunamadı. Kod doğru mu? Host çevrimiçi mi?', 'error');
            }
        } else {
            setButtonLoading('btn-join', false);
            showToast('Bağlantı hatası: ' + err.type, 'error');
        }
    });

    state.peer.on('disconnected', () => {
        console.log('[JOIN] Signaling sunucusundan koptu');
        if (state.peer && !state.peer.destroyed) {
            state.peer.reconnect();
        }
    });
}

// ============================================
// HOST: Connection & Message Handling
// ============================================

function handleNewConnection(conn) {
    conn.on('open', () => {
        console.log('[HOST] Connection open from:', conn.peer);
    });

    conn.on('data', (data) => {
        console.log('[HOST] Data received:', data.type);

        if (data.type === 'join') {
            state.connections[data.peerId] = conn;
            state.gameState.players[data.peerId] = {
                name: data.name,
                vote: null,
                isHost: false
            };
            showToast(`${data.name} odaya katıldı`, 'success');
            broadcastState();
        }

        if (data.type === 'vote') {
            if (state.gameState.players[data.peerId]) {
                state.gameState.players[data.peerId].vote = data.value;
                broadcastState();
            }
        }
    });

    conn.on('close', () => {
        const peerId = Object.keys(state.connections).find(k => state.connections[k] === conn);
        if (peerId && state.gameState.players[peerId]) {
            const name = state.gameState.players[peerId].name;
            delete state.gameState.players[peerId];
            delete state.connections[peerId];
            showToast(`${name} ayrıldı`, 'info');
            broadcastState();
        }
    });
}

function broadcastState() {
    renderRoom(state.gameState);

    const msg = { type: 'state', state: state.gameState };
    Object.entries(state.connections).forEach(([peerId, conn]) => {
        if (conn.open) {
            try {
                conn.send(msg);
            } catch (e) {
                console.error('[HOST] Send error to', peerId, e);
            }
        }
    });
}

// ============================================
// GUEST: Message Handling
// ============================================

function handleGuestMessage(data) {
    if (data.type === 'state') {
        state.localState = data.state;
        renderRoom(data.state);
    }
}

// ============================================
// ENTER ROOM
// ============================================

function enterRoom() {
    showScreen('screen-room');
    document.getElementById('room-code-display').textContent = state.roomCode;
    document.getElementById('user-display').textContent = state.userName;

    if (state.isHost) {
        renderRoom(state.gameState);
    }
}

// ============================================
// RENDER
// ============================================

function renderRoom(data) {
    document.getElementById('room-title').textContent = data.name || 'Oda';

    const deckType = data.deck || 'fibonacci';
    const revealed = data.revealed || false;

    const storyInputRow = document.querySelector('.story-input-row');
    if (storyInputRow) {
        storyInputRow.style.display = state.isHost ? 'flex' : 'none';
    }
    document.getElementById('story-text').textContent = data.story || 'Henüz bir story belirlenmedi';

    document.getElementById('admin-controls').style.display = state.isHost ? 'flex' : 'none';

    renderCards(deckType, revealed);
    renderPlayers(data.players || {}, revealed);
    renderTableStatus(data.players || {}, revealed);
}

function renderCards(deckType, revealed) {
    const container = document.getElementById('card-deck');
    const cards = DECKS[deckType] || DECKS.fibonacci;

    container.innerHTML = '';
    cards.forEach(value => {
        const card = document.createElement('div');
        card.className = 'poker-card';
        if (state.selectedCard === value) card.classList.add('selected');
        if (revealed) card.classList.add('disabled');
        card.textContent = value;
        card.addEventListener('click', () => selectCard(value));
        container.appendChild(card);
    });
}

function renderPlayers(players, revealed) {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    Object.entries(players).forEach(([peerId, player]) => {
        const slot = document.createElement('div');
        slot.className = 'player-slot';

        const card = document.createElement('div');
        card.className = 'player-card';

        if (player.vote !== null && player.vote !== undefined) {
            if (revealed) {
                card.classList.add('revealed');
                card.textContent = player.vote;
            } else {
                card.classList.add('voted');
                card.textContent = '\u2713';
            }
        } else {
            card.classList.add('empty');
            card.textContent = '?';
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'player-name';
        if (peerId === state.peerId) nameEl.classList.add('is-me');
        nameEl.textContent = player.name || 'Anonim';

        slot.appendChild(card);
        slot.appendChild(nameEl);
        grid.appendChild(slot);
    });
}

function renderTableStatus(players, revealed) {
    const statusEl = document.getElementById('table-status');
    const resultEl = document.getElementById('vote-result');

    const entries = Object.entries(players);
    const votedCount = entries.filter(([, p]) => p.vote !== null && p.vote !== undefined).length;
    const totalCount = entries.length;

    if (revealed) {
        statusEl.style.display = 'none';
        resultEl.classList.remove('hidden');

        const numericVotes = entries
            .map(([, p]) => p.vote)
            .filter(v => v !== null && v !== undefined && v !== '?' && v !== '\u2615')
            .map(v => {
                const tshirtMap = { 'XS': 1, 'S': 2, 'M': 3, 'L': 5, 'XL': 8, 'XXL': 13 };
                return tshirtMap[v] !== undefined ? tshirtMap[v] : parseFloat(v);
            })
            .filter(v => !isNaN(v));

        if (numericVotes.length > 0) {
            const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
            document.getElementById('result-avg-value').textContent = avg.toFixed(1);

            const allSame = numericVotes.every(v => v === numericVotes[0]);
            if (allSame) {
                document.getElementById('result-consensus-value').textContent = '\u2705 Tam';
            } else {
                const spread = Math.max(...numericVotes) - Math.min(...numericVotes);
                document.getElementById('result-consensus-value').textContent =
                    spread <= 2 ? '\uD83D\uDC4D Yakın' : '\u26a0\ufe0f Tartışın';
            }
        } else {
            document.getElementById('result-avg-value').textContent = '-';
            document.getElementById('result-consensus-value').textContent = '-';
        }
    } else {
        statusEl.style.display = 'block';
        resultEl.classList.add('hidden');

        if (votedCount === 0) {
            statusEl.textContent = 'Oylarınızı seçin...';
        } else if (votedCount === totalCount) {
            statusEl.textContent = `\u2705 Herkes oy verdi! (${votedCount}/${totalCount})`;
        } else {
            statusEl.textContent = `${votedCount}/${totalCount} oy verildi`;
        }
    }
}

// ============================================
// ACTIONS
// ============================================

function selectCard(value) {
    const currentState = state.isHost ? state.gameState : state.localState;
    if (currentState && currentState.revealed) return;

    if (state.selectedCard === value) {
        state.selectedCard = null;
    } else {
        state.selectedCard = value;
    }

    if (state.isHost) {
        state.gameState.players[state.peerId].vote = state.selectedCard;
        broadcastState();
    } else {
        if (state.hostConnection && state.hostConnection.open) {
            state.hostConnection.send({
                type: 'vote',
                peerId: state.peerId,
                value: state.selectedCard
            });
        }
    }
}

document.getElementById('btn-set-story').addEventListener('click', () => {
    if (!state.isHost) return;
    const storyInput = document.getElementById('story-input');
    const story = storyInput.value.trim();
    if (!story) return;
    state.gameState.story = story;
    storyInput.value = '';
    broadcastState();
    showToast('Story belirlendi', 'success');
});

document.getElementById('btn-reveal').addEventListener('click', () => {
    if (!state.isHost) return;
    state.gameState.revealed = true;
    broadcastState();
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (!state.isHost) return;
    state.selectedCard = null;
    state.gameState.revealed = false;
    Object.keys(state.gameState.players).forEach(pid => {
        state.gameState.players[pid].vote = null;
    });
    broadcastState();
    showToast('Yeni oylama başlatıldı', 'success');
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
    const url = `${window.location.origin}${window.location.pathname}#${state.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Davet linki kopyalandı!', 'success');
    }).catch(() => {
        navigator.clipboard.writeText(state.roomCode).then(() => {
            showToast('Oda kodu kopyalandı!', 'success');
        });
    });
});

document.getElementById('btn-leave').addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    if (state.hostConnection) {
        state.hostConnection.close();
        state.hostConnection = null;
    }
    if (state.peer) {
        state.peer.destroy();
        state.peer = null;
    }

    state.peerId = null;
    state.roomCode = null;
    state.selectedCard = null;
    state.connections = {};
    state.gameState = null;
    state.localState = null;
    window.location.hash = '';

    showScreen('screen-lobby');
}

// ============================================
// AUTO-JOIN FROM URL HASH
// ============================================

window.addEventListener('load', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.length === 6) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="join"]').classList.add('active');
        document.getElementById('tab-join').classList.add('active');
        document.getElementById('join-room-id').value = hash;
    }
});

document.querySelectorAll('#screen-lobby input').forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const activeTab = document.querySelector('.tab.active').dataset.tab;
            document.getElementById(activeTab === 'create' ? 'btn-create' : 'btn-join').click();
        }
    });
});

document.getElementById('story-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-set-story').click();
    }
});
