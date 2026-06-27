const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = '4TOON2024';

// ========== اتاق عمومی ==========
const room = {
    users: [],
    messages: [],
    images: [],
    bannedUsers: [],
    adminId: null
};

// ========== Socket.IO ==========
io.on('connection', (socket) => {
    console.log('🟢 کاربر وصل شد:', socket.id);

    // ====== ورود به اتاق عمومی ======
    socket.on('join-room', ({ userName }) => {
        if (room.bannedUsers.includes(socket.id)) {
            socket.emit('error', '🚫 شما از اتاق بن شده‌اید!');
            return;
        }

        // اگر کسی توی اتاق نبود، اولین نفر ادمین میشه
        const isFirstUser = room.users.length === 0;
        
        socket.join('public-room');
        room.users.push({
            id: socket.id,
            name: userName || 'ناشناس',
            isAdmin: isFirstUser
        });

        if (isFirstUser) {
            room.adminId = socket.id;
            socket.emit('you-are-admin', true);
        }

        // ارسال اطلاعات به همه
        io.to('public-room').emit('user-joined', room.users);
        io.to('public-room').emit('users-update', room.users);
        socket.emit('chat-history', room.messages);
        socket.emit('images-update', room.images);

        console.log(`👤 ${userName} وارد اتاق عمومی شد`);
    });

    // ====== سیگنالینگ WebRTC ======
    socket.on('signal', ({ data }) => {
        socket.to('public-room').emit('signal', {
            from: socket.id,
            data: data
        });
    });

    // ====== پیام چت ======
    socket.on('chat-message', ({ message }) => {
        const user = room.users.find(u => u.id === socket.id);
        const msg = {
            id: Date.now(),
            userId: socket.id,
            user: user ? user.name : 'ناشناس',
            message: message,
            time: new Date().toLocaleTimeString('fa-IR')
        };

        room.messages.push(msg);
        io.to('public-room').emit('chat-message', msg);
    });

    // ====== اشتراک عکس ======
    socket.on('share-image', ({ imageData, fileName }) => {
        const user = room.users.find(u => u.id === socket.id);
        const image = {
            id: Date.now(),
            userId: socket.id,
            user: user ? user.name : 'ناشناس',
            data: imageData,
            fileName: fileName || 'عکس',
            time: new Date().toLocaleTimeString('fa-IR')
        };

        room.images.push(image);
        io.to('public-room').emit('new-image', image);
    });

    // ====== قابلیت‌های ادمین ======
    socket.on('admin-delete-message', ({ messageId, password }) => {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('error', '❌ پسورد اشتباه است!');
            return;
        }
        if (room.adminId !== socket.id) {
            socket.emit('error', '❌ فقط ادمین می‌تونه پیام حذف کنه!');
            return;
        }

        const index = room.messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            room.messages.splice(index, 1);
            io.to('public-room').emit('message-deleted', messageId);
            io.to('public-room').emit('notification', '🗑️ یک پیام توسط ادمین حذف شد.');
        }
    });

    socket.on('admin-clear-chat', ({ password }) => {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('error', '❌ پسورد اشتباه است!');
            return;
        }
        if (room.adminId !== socket.id) {
            socket.emit('error', '❌ فقط ادمین می‌تونه چت رو پاک کنه!');
            return;
        }

        room.messages = [];
        io.to('public-room').emit('chat-cleared');
        io.to('public-room').emit('notification', '🗑️ همه‌ی پیام‌ها توسط ادمین پاک شد.');
    });

    socket.on('admin-delete-image', ({ imageId, password }) => {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('error', '❌ پسورد اشتباه است!');
            return;
        }
        if (room.adminId !== socket.id) {
            socket.emit('error', '❌ فقط ادمین می‌تونه عکس حذف کنه!');
            return;
        }

        const index = room.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            room.images.splice(index, 1);
            io.to('public-room').emit('image-deleted', imageId);
            io.to('public-room').emit('notification', '🗑️ یک عکس توسط ادمین حذف شد.');
        }
    });

    socket.on('admin-ban-user', ({ userId, password }) => {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('error', '❌ پسورد اشتباه است!');
            return;
        }
        if (room.adminId !== socket.id) {
            socket.emit('error', '❌ فقط ادمین می‌تونه کاربر رو بن کنه!');
            return;
        }
        if (userId === socket.id) {
            socket.emit('error', '❌ نمی‌تونی خودت رو بن کنی!');
            return;
        }

        room.bannedUsers.push(userId);
        const userIndex = room.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            const bannedUser = room.users[userIndex];
            room.users.splice(userIndex, 1);
            io.to('public-room').emit('users-update', room.users);
            io.to('public-room').emit('notification', `🚫 ${bannedUser.name} توسط ادمین بن شد.`);

            const targetSocket = io.sockets.sockets.get(userId);
            if (targetSocket) {
                targetSocket.emit('you-are-banned', 'شما توسط ادمین بن شدید!');
                targetSocket.disconnect(true);
            }
        }
    });

    socket.on('admin-announce', ({ message, password }) => {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('error', '❌ پسورد اشتباه است!');
            return;
        }
        if (room.adminId !== socket.id) {
            socket.emit('error', '❌ فقط ادمین می‌تونه اعلامیه بده!');
            return;
        }

        io.to('public-room').emit('announcement', {
            text: message,
            time: new Date().toLocaleTimeString('fa-IR')
        });
        io.to('public-room').emit('notification', `📢 اعلامیه: ${message}`);
    });

    // ====== قطع شدن ======
    socket.on('disconnect', () => {
        console.log('🔴 کاربر قطع شد:', socket.id);

        const userIndex = room.users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
            room.users.splice(userIndex, 1);
            io.to('public-room').emit('user-left', room.users);
            io.to('public-room').emit('users-update', room.users);

            if (room.users.length === 0) {
                // اتاق خالی شد، ریست میشه
                room.messages = [];
                room.images = [];
                room.bannedUsers = [];
                room.adminId = null;
                console.log('🗑️ اتاق عمومی خالی شد و ریست شد');
            } else if (room.adminId === socket.id) {
                room.adminId = room.users[0].id;
                room.users[0].isAdmin = true;
                io.to('public-room').emit('users-update', room.users);
                io.to('public-room').emit('notification', '👑 ادمین جدید انتخاب شد.');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 سرور روی پورت ${PORT} اجرا شد`);
    console.log(`🔑 پسورد ادمین: ${ADMIN_PASSWORD}`);
});