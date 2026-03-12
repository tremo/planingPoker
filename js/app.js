// ============================================
// Planning Poker - Main Application
// ============================================

const DECKS = {
    fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '\u2615'],
    tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '\u2615']
};

// App State
const state = {
    userId: null,
    userName: null,
    roomId: null,
    roomRef: null,
    isAdmin: false,
    selectedCard: null,
    revealed: false,
    deck: 'fibonacci',
    listeners: []
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

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ============================================
// LOBBY
// ============================================

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// Deck selection
document.querySelectorAll('.deck-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.deck-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.deck = btn.dataset.deck;
    });
});

// Create Room
document.getElementById('btn-create').addEventListener('click', async () => {
    const name = document.getElementById('create-name').value.trim();
    const roomName = document.getElementById('create-room-name').value.trim();

    if (!name) {
        showToast('L\u00fctfen ad\u0131n\u0131z\u0131 girin', 'error');
        return;
    }
    if (!roomName) {
        showToast('L\u00fctfen oda ad\u0131 girin', 'error');
        return;
    }

    try {
        initUser();
        const roomCode = generateRoomCode();
        state.roomId = roomCode;
        state.userName = name;
        state.isAdmin = true;

        const roomRef = db.ref(`rooms/${roomCode}`);
        await roomRef.set({
            name: roomName,
            deck: state.deck,
            admin: state.userId,
            story: '',
            revealed: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {
                [state.userId]: {
                    name: name,
                    vote: null,
                    online: true
                }
            }
        });

        // Update URL hash
        window.location.hash = roomCode;
        enterRoom(roomCode);
    } catch (err) {
        showToast('Oda olu\u015fturulamad\u0131: ' + err.message, 'error');
    }
});

// Join Room
document.getElementById('btn-join').addEventListener('click', async () => {
    const name = document.getElementById('join-name').value.trim();
    const roomCode = document.getElementById('join-room-id').value.trim().toUpperCase();

    if (!name) {
        showToast('L\u00fctfen ad\u0131n\u0131z\u0131 girin', 'error');
        return;
    }
    if (!roomCode || roomCode.length !== 6) {
        showToast('Ge\u00e7erli bir oda kodu girin', 'error');
        return;
    }

    try {
        initUser();
        const snapshot = await db.ref(`rooms/${roomCode}`).once('value');
        if (!snapshot.exists()) {
            showToast('Oda bulunamad\u0131', 'error');
            return;
        }

        state.roomId = roomCode;
        state.userName = name;
        state.isAdmin = false;

        await db.ref(`rooms/${roomCode}/players/${state.userId}`).set({
            name: name,
            vote: null,
            online: true
        });

        window.location.hash = roomCode;
        enterRoom(roomCode);
    } catch (err) {
        showToast('Odaya kat\u0131l\u0131namad\u0131: ' + err.message, 'error');
    }
});

// ============================================
// USER ID (client-side, no auth needed)
// ============================================

function getOrCreateUserId() {
    let id = localStorage.getItem('pp_user_id');
    if (!id) {
        id = 'u_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('pp_user_id', id);
    }
    return id;
}

function initUser() {
    state.userId = getOrCreateUserId();
}

// ============================================
// ROOM
// ============================================

function enterRoom(roomCode) {
    state.roomRef = db.ref(`rooms/${roomCode}`);

    showScreen('screen-room');
    document.getElementById('room-code-display').textContent = roomCode;
    document.getElementById('user-display').textContent = state.userName;

    // Set presence
    const playerRef = db.ref(`rooms/${roomCode}/players/${state.userId}`);
    playerRef.onDisconnect().update({ online: false });

    // Listen to room data
    const roomListener = state.roomRef.on('value', snapshot => {
        if (!snapshot.exists()) {
            showToast('Oda silindi', 'error');
            leaveRoom();
            return;
        }
        const data = snapshot.val();
        renderRoom(data);
    });
    state.listeners.push({ ref: state.roomRef, event: 'value', callback: roomListener });
}

function renderRoom(data) {
    // Room title
    document.getElementById('room-title').textContent = data.name || 'Oda';

    // Deck
    const deckType = data.deck || 'fibonacci';

    // Admin check
    state.isAdmin = data.admin === state.userId;
    state.revealed = data.revealed || false;

    // Story section - story input visible to admin only
    const storyInputRow = document.querySelector('.story-input-row');
    if (storyInputRow) {
        storyInputRow.style.display = state.isAdmin ? 'flex' : 'none';
    }
    document.getElementById('story-text').textContent = data.story || 'Hen\u00fcz bir story belirlenmedi';

    // Admin controls
    const adminControls = document.getElementById('admin-controls');
    adminControls.style.display = state.isAdmin ? 'flex' : 'none';

    // Render cards
    renderCards(deckType);

    // Render players
    renderPlayers(data.players || {}, data.revealed);

    // Table status
    renderTableStatus(data.players || {}, data.revealed);
}

function renderCards(deckType) {
    const container = document.getElementById('card-deck');
    const cards = DECKS[deckType] || DECKS.fibonacci;

    container.innerHTML = '';
    cards.forEach(value => {
        const card = document.createElement('div');
        card.className = 'poker-card';
        if (state.selectedCard === value) card.classList.add('selected');
        if (state.revealed) card.classList.add('disabled');
        card.textContent = value;
        card.addEventListener('click', () => selectCard(value));
        container.appendChild(card);
    });
}

function renderPlayers(players, revealed) {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    Object.entries(players).forEach(([uid, player]) => {
        if (!player.online && uid !== state.userId) return;

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
        if (uid === state.userId) nameEl.classList.add('is-me');
        nameEl.textContent = player.name || 'Anonim';

        slot.appendChild(card);
        slot.appendChild(nameEl);
        grid.appendChild(slot);
    });
}

function renderTableStatus(players, revealed) {
    const statusEl = document.getElementById('table-status');
    const resultEl = document.getElementById('vote-result');

    const onlinePlayers = Object.entries(players).filter(([, p]) => p.online !== false);
    const votedCount = onlinePlayers.filter(([, p]) => p.vote !== null && p.vote !== undefined).length;
    const totalCount = onlinePlayers.length;

    if (revealed) {
        statusEl.style.display = 'none';
        resultEl.classList.remove('hidden');

        // Calculate results
        const numericVotes = onlinePlayers
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

            // Consensus: check if all same
            const allSame = numericVotes.every(v => v === numericVotes[0]);
            if (allSame) {
                document.getElementById('result-consensus-value').textContent = '\u2705 Tam';
            } else {
                const spread = Math.max(...numericVotes) - Math.min(...numericVotes);
                if (spread <= 2) {
                    document.getElementById('result-consensus-value').textContent = '\ud83d\udc4d Yak\u0131n';
                } else {
                    document.getElementById('result-consensus-value').textContent = '\u26a0\ufe0f Tart\u0131\u015f\u0131n';
                }
            }
        } else {
            document.getElementById('result-avg-value').textContent = '-';
            document.getElementById('result-consensus-value').textContent = '-';
        }
    } else {
        statusEl.style.display = 'block';
        resultEl.classList.add('hidden');

        if (votedCount === 0) {
            statusEl.textContent = 'Oylar\u0131n\u0131z\u0131 se\u00e7in...';
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
    if (state.revealed) return;

    // Toggle: if same card clicked, deselect
    if (state.selectedCard === value) {
        state.selectedCard = null;
        db.ref(`rooms/${state.roomId}/players/${state.userId}/vote`).set(null);
    } else {
        state.selectedCard = value;
        db.ref(`rooms/${state.roomId}/players/${state.userId}/vote`).set(value);
    }
}

// Set Story
document.getElementById('btn-set-story').addEventListener('click', () => {
    const storyInput = document.getElementById('story-input');
    const story = storyInput.value.trim();
    if (!story) return;
    db.ref(`rooms/${state.roomId}/story`).set(story);
    storyInput.value = '';
    showToast('Story belirlendi', 'success');
});

// Reveal
document.getElementById('btn-reveal').addEventListener('click', () => {
    db.ref(`rooms/${state.roomId}/revealed`).set(true);
});

// Reset
document.getElementById('btn-reset').addEventListener('click', async () => {
    state.selectedCard = null;

    const snapshot = await db.ref(`rooms/${state.roomId}/players`).once('value');
    const players = snapshot.val() || {};
    const updates = {};
    Object.keys(players).forEach(uid => {
        updates[`players/${uid}/vote`] = null;
    });
    updates['revealed'] = false;

    await db.ref(`rooms/${state.roomId}`).update(updates);
    showToast('Yeni oylama ba\u015flat\u0131ld\u0131', 'success');
});

// Copy Room Code
document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = state.roomId;
    const url = `${window.location.origin}${window.location.pathname}#${code}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Davet linki kopyaland\u0131!', 'success');
    }).catch(() => {
        // Fallback
        navigator.clipboard.writeText(code).then(() => {
            showToast('Oda kodu kopyaland\u0131!', 'success');
        });
    });
});

// Leave Room
document.getElementById('btn-leave').addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    // Cleanup listeners
    state.listeners.forEach(({ ref, event, callback }) => {
        ref.off(event, callback);
    });
    state.listeners = [];

    if (state.roomId && state.userId) {
        db.ref(`rooms/${state.roomId}/players/${state.userId}/online`).set(false);
    }

    state.roomId = null;
    state.roomRef = null;
    state.selectedCard = null;
    state.revealed = false;
    window.location.hash = '';

    showScreen('screen-lobby');
}

// ============================================
// AUTO-JOIN FROM URL HASH
// ============================================

window.addEventListener('load', async () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.length === 6) {
        // Show join tab with room code pre-filled
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="join"]').classList.add('active');
        document.getElementById('tab-join').classList.add('active');
        document.getElementById('join-room-id').value = hash;
    }
});

// Handle Enter key on inputs
document.querySelectorAll('#screen-lobby input').forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const activeTab = document.querySelector('.tab.active').dataset.tab;
            if (activeTab === 'create') {
                document.getElementById('btn-create').click();
            } else {
                document.getElementById('btn-join').click();
            }
        }
    });
});

document.getElementById('story-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-set-story').click();
    }
});
