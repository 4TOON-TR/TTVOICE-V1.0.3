const socket = io();
let userName = '';
let localStream = null;
let peerConnections = {};
let isMicOn = true;
let isSpeakerOn = true;
let roomUsers = [];
let isAdmin = false;
let adminPassword = '';
let isJoining = false;
let isAudioStarted = false;

// ========== ورود ادمین ==========
function adminLogin() {
    const password = prompt('🔑 پسورد ادمین رو وارد کن:');
    if (password) {
        adminPassword = password;
        window.adminPassword = password;
        alert('✅ به عنوان ادمین وارد شدی!');
        document.querySelectorAll('.delete-msg-btn, .delete-img-btn').forEach(el => {
            el.classList.add('show');
        });
    }
}

// ========== ورود به اتاق عمومی ==========
function joinRoom() {
    if (isJoining) {
        console.log('⏳ در حال ورود هستید، صبر کنید...');
        return;
    }

    const joinBtn = document.getElementById('joinBtn');
    if (joinBtn) {
        joinBtn.disabled = true;
        joinBtn.textContent = '⏳ در حال ورود...';
    }

    isJoining = true;

    userName = document.getElementById('userName').value.trim() || 'ناشناس';
    
    if (!userName) {
        alert('❌ لطفاً اسم خودت رو وارد کن!');
        resetJoinState();
        return;
    }

    // پاک کردن اتصالات قبلی
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        isAudioStarted = false;
    }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    // تغییر صفحه به صفحه تماس
    switchToCallPage();

    socket.emit('join-room', { userName });
}

function resetJoinState() {
    isJoining = false;
    const joinBtn = document.getElementById('joinBtn');
    if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.textContent = '🚀 ورود به اتاق';
    }
}

// ========== تغییر صفحه ==========
function switchToCallPage() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('call-page').style.display = 'block';
    document.getElementById('user-count').textContent = '👤 1 نفر';
}

// ========== راه‌اندازی صدا (برای همه) ==========
async function startAudio() {
    if (isAudioStarted) {
        console.log('🎤 میکروفن قبلاً فعال شده');
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });
        isAudioStarted = true;
        console.log('🎤 میکروفن فعال شد');
        document.getElementById('mic-btn').classList.add('active');
        document.getElementById('mic-btn').textContent = '🎤 میکروفن';
        
        // بعد از فعال شدن میکروفن، به همه وصل شو
        setTimeout(() => {
            connectToAllUsers();
        }, 500);
        
    } catch (err) {
        console.error('❌ خطا در دسترسی به میکروفن:', err);
        alert('❌ به میکروفن دسترسی نداری! لطفاً اجازه بده و دوباره رفرش کن.');
        resetJoinState();
        document.getElementById('login-page').style.display = 'block';
        document.getElementById('call-page').style.display = 'none';
    }
}

// ========== اتصال به همه کاربران ==========
function connectToAllUsers() {
    if (!localStream) return;
    
    const otherUsers = roomUsers.filter(u => u.id !== socket.id);
    for (const user of otherUsers) {
        if (!peerConnections[user.id]) {
            setTimeout(() => {
                createAndSendOffer(user.id);
            }, 300);
        }
    }
}

// ========== رویدادهای Socket ==========
socket.on('connect', () => {
    console.log('✅ به سرور متصل شدی!');
});

socket.on('you-are-admin', () => {
    isAdmin = true;
    document.getElementById('admin-badge').style.display = 'inline';
    alert('👑 شما ادمین این اتاق هستید!');
    
    // فعال کردن دکمه‌های حذف
    document.querySelectorAll('.delete-msg-btn, .delete-img-btn').forEach(el => {
        el.classList.add('show');
    });
    
    // راه‌اندازی میکروفن برای ادمین
    if (!isAudioStarted) {
        startAudio();
    }
});

socket.on('user-joined', (users) => {
    roomUsers = users;
    updateUsersList(users);
    
    // اگر کاربر جدیدی اضافه شد و ما میکروفن نداریم، فعال کن
    if (!isAudioStarted && users.length > 0) {
        startAudio();
    }
    
    // به کاربر جدید وصل شو
    const newUser = users.find(u => u.id !== socket.id && !peerConnections[u.id]);
    if (newUser && localStream) {
        setTimeout(() => {
            createAndSendOffer(newUser.id);
        }, 1000);
    }
});

socket.on('users-update', (users) => {
    resetJoinState();
    roomUsers = users;
    updateUsersList(users);
    document.getElementById('user-count').textContent = `👤 ${users.length} نفر`;
    
    // اگر کاربری هست و ما میکروفن نداریم، فعال کن
    if (!isAudioStarted && users.length > 0) {
        startAudio();
    }
    
    // به همه کاربران وصل شو
    if (localStream) {
        const otherUsers = users.filter(u => u.id !== socket.id);
        for (const user of otherUsers) {
            if (!peerConnections[user.id]) {
                setTimeout(() => {
                    createAndSendOffer(user.id);
                }, 300);
            }
        }
    }
});

socket.on('user-left', (users) => {
    roomUsers = users;
    updateUsersList(users);
    document.getElementById('user-count').textContent = `👤 ${users.length} نفر`;
});

socket.on('chat-history', (messages) => {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    messages.forEach(msg => addChatMessage(msg));
});

socket.on('chat-message', (msg) => {
    addChatMessage(msg);
});

socket.on('message-deleted', (messageId) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) el.remove();
});

socket.on('chat-cleared', () => {
    document.getElementById('chat-messages').innerHTML = '';
});

socket.on('images-update', (images) => {
    const container = document.getElementById('images-container');
    container.innerHTML = '';
    images.forEach(img => addImage(img));
});

socket.on('new-image', (image) => {
    addImage(image);
});

socket.on('image-deleted', (imageId) => {
    const el = document.querySelector(`[data-img-id="${imageId}"]`);
    if (el) el.remove();
});

socket.on('signal', ({ from, data }) => {
    handleSignal(from, data);
});

socket.on('notification', (msg) => {
    showNotification(msg);
});

socket.on('announcement', (data) => {
    showAnnouncement(data);
});

socket.on('you-are-banned', (msg) => {
    alert('🚫 ' + msg);
    leaveRoom();
});

socket.on('error', (msg) => {
    resetJoinState();
    alert('❌ ' + msg);
});

// ========== WebRTC ==========
function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    });

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.play().catch(e => console.log('Audio play error:', e));
        console.log('🔊 استریم صوتی دریافت شد!');
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                data: {
                    type: 'ice',
                    candidate: event.candidate
                }
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected') {
            console.log('✅ WebRTC متصل شد!');
        } else if (pc.iceConnectionState === 'failed') {
            console.log('❌ WebRTC قطع شد!');
        } else if (pc.iceConnectionState === 'disconnected') {
            console.log('⚠️ WebRTC قطع موقت!');
        }
    };

    return pc;
}

function handleSignal(from, data) {
    console.log('📡 سیگنال از:', from, 'نوع:', data.type);

    if (data.type === 'offer') {
        if (!peerConnections[from]) {
            peerConnections[from] = createPeerConnection(from);
        }
        const pc = peerConnections[from];
        
        pc.setRemoteDescription(new RTCSessionDescription(data.offer))
            .then(() => pc.createAnswer())
            .then(answer => pc.setLocalDescription(answer))
            .then(() => {
                socket.emit('signal', {
                    data: {
                        type: 'answer',
                        answer: pc.localDescription
                    }
                });
            })
            .catch(err => console.error('❌ خطا در پاسخ به Offer:', err));

    } else if (data.type === 'answer') {
        if (peerConnections[from]) {
            peerConnections[from].setRemoteDescription(new RTCSessionDescription(data.answer))
                .catch(err => console.error('❌ خطا در تنظیم Answer:', err));
        }

    } else if (data.type === 'ice') {
        if (peerConnections[from]) {
            peerConnections[from].addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(err => console.error('❌ خطا در اضافه کردن ICE:', err));
        }
    }
}

function createAndSendOffer(targetId) {
    if (!localStream) {
        console.log('❌ استریم محلی آماده نیست!');
        return;
    }
    
    if (peerConnections[targetId]) {
        console.log('ℹ️ قبلاً به این کاربر وصل شدی:', targetId);
        return;
    }

    const pc = createPeerConnection(targetId);
    peerConnections[targetId] = pc;

    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            socket.emit('signal', {
                data: {
                    type: 'offer',
                    offer: pc.localDescription
                }
            });
            console.log('📤 Offer فرستاده شد به:', targetId);
        })
        .catch(err => console.error('❌ خطا در ایجاد Offer:', err));
}

// ========== میکروفن و اسپیکر ==========
function toggleMic() {
    if (localStream) {
        isMicOn = !isMicOn;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isMicOn;
        });
        document.getElementById('mic-btn').textContent = isMicOn ? '🎤 میکروفن' : '🔇 بی‌صدا';
        document.getElementById('mic-btn').classList.toggle('active', isMicOn);
    } else {
        alert('❌ میکروفن فعال نیست! لطفاً صفحه رو رفرش کن.');
        startAudio();
    }
}

function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    document.getElementById('speaker-btn').textContent = isSpeakerOn ? '🔊 اسپیکر' : '🔇 بی‌صدا';
    document.getElementById('speaker-btn').classList.toggle('active', isSpeakerOn);
}

// ========== پیام ==========
function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    socket.emit('chat-message', { message });
    input.value = '';
}

function addChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.setAttribute('data-msg-id', msg.id);
    
    div.innerHTML = `
        <span class="sender">${escapeHtml(msg.user)}</span>
        <span class="text">${escapeHtml(msg.message)}</span>
        <span class="time">${msg.time || ''}</span>
        ${isAdmin ? `<button class="delete-msg-btn show" onclick="deleteMessage(${msg.id})">🗑️</button>` : ''}
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function deleteMessage(messageId) {
    if (!isAdmin) return;
    const password = window.adminPassword || prompt('🔑 پسورد ادمین:');
    if (password) {
        socket.emit('admin-delete-message', {
            messageId,
            password: password
        });
    }
}

function clearChat() {
    if (!isAdmin) return;
    if (confirm('آیا از پاک کردن همه‌ی پیام‌ها مطمئنی؟')) {
        const password = window.adminPassword || prompt('🔑 پسورد ادمین:');
        if (password) {
            socket.emit('admin-clear-chat', {
                password: password
            });
        }
    }
}

function banUser(userId, userName) {
    if (!isAdmin) return;
    if (confirm(`آیا از بن کردن ${userName} مطمئنی؟`)) {
        const password = window.adminPassword || prompt('🔑 پسورد ادمین:');
        if (password) {
            socket.emit('admin-ban-user', {
                userId,
                password: password
            });
        }
    }
}

// ========== عکس ==========
function shareImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        socket.emit('share-image', {
            imageData: e.target.result,
            fileName: file.name
        });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function addImage(image) {
    const container = document.getElementById('images-container');
    const div = document.createElement('div');
    div.className = 'image-item';
    div.setAttribute('data-img-id', image.id);
    div.innerHTML = `
        <img src="${image.data}" alt="${image.fileName}">
        <div class="image-info">${escapeHtml(image.user)} ${image.time || ''}</div>
        ${isAdmin ? `<button class="delete-img-btn show" onclick="deleteImage(${image.id})">🗑️</button>` : ''}
    `;
    container.appendChild(div);
}

function deleteImage(imageId) {
    if (!isAdmin) return;
    const password = window.adminPassword || prompt('🔑 پسورد ادمین:');
    if (password) {
        socket.emit('admin-delete-image', {
            imageId,
            password: password
        });
    }
}

// ========== اعلان‌ها ==========
function showNotification(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'notification';
    div.textContent = '📢 ' + msg;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function showAnnouncement(data) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'announcement';
    div.textContent = `📢 ${data.text} (${data.time})`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ========== لیست کاربران ==========
function updateUsersList(users) {
    const container = document.getElementById('users-list');
    container.innerHTML = '';
    users.forEach(user => {
        const span = document.createElement('span');
        span.className = 'user-badge' + (user.isAdmin ? ' admin' : '');
        span.innerHTML = user.isAdmin ? `👑 ${escapeHtml(user.name)}` : escapeHtml(user.name);
        
        if (isAdmin && user.id !== socket.id) {
            const banBtn = document.createElement('button');
            banBtn.className = 'ban-btn';
            banBtn.textContent = '🚫';
            banBtn.title = 'بن کردن کاربر';
            banBtn.onclick = () => banUser(user.id, user.name);
            span.appendChild(banBtn);
        }
        
        container.appendChild(span);
    });
}

// ========== خروج ==========
function leaveRoom() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        isAudioStarted = false;
    }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    window.location.reload();
}

// ========== توابع کمکی ==========
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
console.log('✅ TTVOICE RUN SHOD!');
console.log('✅ تو کد ها سرک نکش اسیر میشی');
console.log('✅ برو پی کارت');