import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import '../App.css';

const ENDPOINT = 'https://chat-backend-s13a.onrender.com';
let socket;

// Memoized ChatItem component to prevent unnecessary re-renders
const ChatItem = memo(({ chat, isActive, onSelect, getChatAvatar, getChatName, unreadCount }) => (
  <div
    className={`chat-item ${isActive ? 'active' : ''}`}
    onClick={() => onSelect(chat)}
  >
    <img src={getChatAvatar(chat)} alt="" className="avatar" />
    <div className="chat-info">
      <div className="chat-name">
        {getChatName(chat)}
        {chat.isGroupChat && <span className="group-badge">Group</span>}
      </div>
      <div className="last-message">
        {chat.latestMessage ? (
          <span className="new-message-label">📩 New message</span>
        ) : (
          'Start chatting'
        )}
      </div>
    </div>
    {unreadCount > 0 && (
      <div className="unread-badge">{unreadCount}</div>
    )}
  </div>
));

const Chat = () => {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [notification, setNotification] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({}); // Track unread messages per chat
  const messagesEndRef = useRef(null);
  const selectedChatRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !userData) {
      navigate('/');
      return;
    }

    setUser(userData);
    
    // Initialize Socket.io with better configuration
    socket = io(ENDPOINT, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      socket.emit('setup', userData._id);
    });
    
    socket.on('disconnect', () => {
      console.warn('Socket disconnected');
    });
    
    socket.on('reconnect', () => {
      console.log('Socket reconnected');
      socket.emit('setup', userData._id);
    });
    
    socket.on('user-online', (userId) => {
      fetchOnlineUsers();
      fetchAllUsers();
    });
    
    socket.on('user-offline', (userId) => {
      fetchOnlineUsers();
      fetchAllUsers();
    });
    
    socket.on('message-received', (message) => {
      const currentChat = selectedChatRef.current;
      
      // Instantly add message to current chat if we're viewing it
      if (currentChat && message.chat._id === currentChat._id) {
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.some(m => m._id === message._id);
          if (!exists) {
            // WhatsApp-style: Auto-mark as read when chat is open
            setTimeout(() => {
              markMessagesAsRead(currentChat._id);
            }, 500); // Small delay to feel natural
            
            return [...prev, message];
          }
          return prev;
        });
      } else {
        // Show popup notification if message is from different chat
        setNotification({
          sender: message.sender.username,
          content: message.content,
          chatId: message.chat._id,
          avatar: message.sender.avatar
        });
        
        // Increment unread count for this chat
        setUnreadCounts(prev => ({
          ...prev,
          [message.chat._id]: (prev[message.chat._id] || 0) + 1
        }));
        
        // Auto-hide notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
      }
      
      // Update chat list without re-fetching (prevents flicker)
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat._id === message.chat._id) {
            return {
              ...chat,
              latestMessage: message
            };
          }
          return chat;
        }).sort((a, b) => {
          // Sort by latest message time
          const aTime = a.latestMessage?.createdAt || a.updatedAt;
          const bTime = b.latestMessage?.createdAt || b.updatedAt;
          return new Date(bTime) - new Date(aTime);
        });
      });
    });
    
    // Removed chat-updated listener - no longer needed
    // Chat list updates locally now (no flicker)
    
    socket.on('typing', () => setIsTyping(true));
    socket.on('stop-typing', () => setIsTyping(false));
    
    socket.on('messages-read-update', (data) => {
      // Update messages to mark as read
      setMessages(prevMessages => {
        return prevMessages.map(msg => {
          // Add current user to readBy array
          if (!msg.readBy) {
            msg.readBy = [];
          }
          
          // Check if not already in readBy
          const alreadyRead = msg.readBy.some(r => 
            r.user && r.user._id === data.userId
          );
          
          if (!alreadyRead && msg.sender._id !== data.userId) {
            return {
              ...msg,
              readBy: [...msg.readBy, { user: { _id: data.userId }, readAt: new Date() }]
            };
          }
          
          return msg;
        });
      });
    });
    
    socket.on('friend-request-received', (data) => {
      fetchFriendRequests();
      fetchAllUsers();
    });
    
    socket.on('friend-request-accepted-notification', (data) => {
      fetchAllUsers();
      fetchOnlineUsers();
    });

    fetchChats();
    fetchOnlineUsers();
    fetchAllUsers();
    fetchFriendRequests();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('https://chat-backend-s13a.onrender.com/api/chats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Sort chats by latest message - most recent on top
      const sortedChats = data.sort((a, b) => {
        const aTime = a.latestMessage?.createdAt || a.updatedAt || 0;
        const bTime = b.latestMessage?.createdAt || b.updatedAt || 0;
        return new Date(bTime) - new Date(aTime);
      });
      
      setChats(sortedChats);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  }, []);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('https://chat-backend-s13a.onrender.com/api/users/online', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOnlineUsers(data);
    } catch (error) {
      console.error('Error fetching online users:', error);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('https://chat-backend-s13a.onrender.com/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  const fetchFriendRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('https://chat-backend-s13a.onrender.com/api/friends/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriendRequests(data);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
    }
  }, []);

  const sendFriendRequest = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`https://chat-backend-s13a.onrender.com/api/friends/request/${userId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      socket.emit('friend-request-sent', { from: user._id, to: userId });
      fetchAllUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error sending request');
    }
  };

  const acceptFriendRequest = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`https://chat-backend-s13a.onrender.com/api/friends/accept/${userId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      socket.emit('friend-request-accepted', { from: user._id, to: userId });
      fetchFriendRequests();
      fetchAllUsers();
      fetchOnlineUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting request');
    }
  };

  const rejectFriendRequest = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`https://chat-backend-s13a.onrender.com/api/friends/reject/${userId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      fetchFriendRequests();
      fetchAllUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error rejecting request');
    }
  };

  const fetchMessages = async (chatId) => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`https://chat-backend-s13a.onrender.com/api/messages/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(data);
      socket.emit('join-chat', chatId);
      
      // Mark messages as read
      markMessagesAsRead(chatId);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markMessagesAsRead = async (chatId) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(`https://chat-backend-s13a.onrender.com/api/messages/read/${chatId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (socket && socket.connected) {
        socket.emit('messages-read', { chatId, userId: user._id });
      }
    } catch (error) {
      // Silently fail - don't break the app
      console.error('Could not mark messages as read:', error.message);
    }
  };

  const clearChat = async () => {
    if (!selectedChat) return;
    
    const confirmed = window.confirm('Are you sure you want to clear this chat? This cannot be undone.');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`https://chat-backend-s13a.onrender.com/api/messages/clear/${selectedChat._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessages([]);
      setShowChatMenu(false);
      alert('Chat cleared successfully!');
    } catch (error) {
      console.error('Error clearing chat:', error);
      alert('Failed to clear chat');
    }
  };

  const handleLogout = () => {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (!confirmed) return;

    // Disconnect socket
    if (socket) {
      socket.disconnect();
    }

    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Navigate to login page
    navigate('/');
  };

  const handleChatSelect = (chat) => {
    setSelectedChat(chat);
    selectedChatRef.current = chat;
    fetchMessages(chat._id);
    setIsMobileSidebarOpen(false); // Close sidebar on mobile when chat is selected
    
    // Clear unread count for this chat
    setUnreadCounts(prev => ({
      ...prev,
      [chat._id]: 0
    }));
  };

  const handleUserClick = async (userId, isFriend) => {
    if (!isFriend) {
      alert('You need to be friends to start chatting');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post('https://chat-backend-s13a.onrender.com/api/chats', 
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const existingChat = chats.find(c => c._id === data._id);
      if (!existingChat) {
        setChats([data, ...chats]);
      }
      setSelectedChat(data);
      selectedChatRef.current = data;
      fetchMessages(data._id);
      setShowAllUsers(false);
      setIsMobileSidebarOpen(false); // Close sidebar on mobile
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const messageContent = newMessage;
    setNewMessage(''); // Clear input immediately for better UX

    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post('https://chat-backend-s13a.onrender.com/api/messages',
        { content: messageContent, chatId: selectedChat._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Add message to sender's screen immediately
      setMessages(prev => [...prev, data]);
      
      // Emit to Socket.io for instant delivery to receiver
      socket.emit('new-message', data);
      
      // Update chat list without re-fetching (prevents flicker)
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat._id === selectedChat._id) {
            return {
              ...chat,
              latestMessage: data
            };
          }
          return chat;
        }).sort((a, b) => {
          const aTime = a.latestMessage?.createdAt || a.updatedAt;
          const bTime = b.latestMessage?.createdAt || b.updatedAt;
          return new Date(bTime) - new Date(aTime);
        });
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent); // Restore message on error
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!typing) {
      setTyping(true);
      socket.emit('typing', selectedChat._id);
    }
    
    let lastTypingTime = new Date().getTime();
    setTimeout(() => {
      const timeNow = new Date().getTime();
      if (timeNow - lastTypingTime >= 3000 && typing) {
        socket.emit('stop-typing', selectedChat._id);
        setTyping(false);
      }
    }, 3000);
  };

  const onEmojiClick = (emojiObject) => {
    setNewMessage(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 2) {
      alert('Please enter group name and select at least 2 users');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post('https://chat-backend-s13a.onrender.com/api/chats/group',
        { name: groupName, users: selectedUsers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setChats([data, ...chats]);
      setShowGroupModal(false);
      setGroupName('');
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const getFriends = () => {
    return allUsers.filter(u => u.isFriend);
  };

  const getChatName = (chat) => {
    if (chat.isGroupChat) return chat.chatName;
    const otherUser = chat.users.find(u => u._id !== user._id);
    return otherUser?.username || 'Unknown';
  };

  const getChatAvatar = (chat) => {
    if (chat.isGroupChat) return 'https://ui-avatars.com/api/?background=FF6B35&color=fff&name=' + chat.chatName;
    const otherUser = chat.users.find(u => u._id !== user._id);
    return otherUser?.avatar || '';
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const isMessageRead = useCallback((message) => {
    if (!message || !user) return false;
    
    // Only show status for messages sent by current user
    if (message.sender._id === user._id) {
      // Check if message is read by other users
      if (!message.readBy || !Array.isArray(message.readBy) || message.readBy.length === 0) {
        return false; // Not read yet - show "Delivered"
      }
      
      // Check if any other user (not the sender) has read the message
      const readByOthers = message.readBy.some(r => {
        return r.user && r.user._id && r.user._id !== user._id;
      });
      
      return readByOthers;
    }
    return false;
  }, [user]);

  // Memoize filtered chats to prevent re-filtering on every render
  const individualChats = useMemo(() => {
    return chats.filter(chat => !chat.isGroupChat);
  }, [chats]);

  const groupChats = useMemo(() => {
    return chats.filter(chat => chat.isGroupChat);
  }, [chats]);

  return (
    <>
      {notification && (
        <motion.div
          className="new-message-notification"
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          onClick={() => {
            const chat = chats.find(c => c._id === notification.chatId);
            if (chat) {
              handleChatSelect(chat);
              selectedChatRef.current = chat;
            }
            setNotification(null);
          }}
        >
          <div className="notification-header">
            <img 
              src={notification.avatar} 
              alt={notification.sender} 
              className="notification-avatar"
            />
            <div>
              <div className="notification-sender">{notification.sender}</div>
              <div className="notification-time">Just now</div>
            </div>
          </div>
          <div className="notification-content">
            {notification.content.length > 80 
              ? notification.content.substring(0, 80) + '...' 
              : notification.content}
          </div>
        </motion.div>
      )}
      
      {/* Mobile Menu Toggle */}
      {!selectedChat && (
        <button 
          className="mobile-menu-toggle"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        >
          ☰
        </button>
      )}
      
      {/* Mobile Back Button */}
      {selectedChat && (
        <button 
          className="mobile-back-btn"
          onClick={() => setSelectedChat(null)}
        >
          ← Back
        </button>
      )}
      
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`mobile-sidebar-overlay ${isMobileSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />
      
      <div className="chat-container">
      <div className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <h2>💬 Chats</h2>
            {user && (
              <span style={{ fontSize: '14px', color: '#999' }}>
                ({user.username})
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', width: '100%' }}>
            <button 
              className="new-group-btn" 
              onClick={() => setShowRequests(!showRequests)}
              style={{ position: 'relative' }}
              title="Friend Requests"
            >
              🔔 {friendRequests.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: 'red',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {friendRequests.length}
                </span>
              )}
            </button>
            <button 
              className="new-group-btn" 
              onClick={() => setShowAllUsers(!showAllUsers)}
              title="All Users"
            >
              Users
            </button>
            <button 
              className="new-group-btn" 
              onClick={() => setShowGroupModal(true)}
              title="Create Group"
            >
              + Group
            </button>
          </div>
        </div>

        {showRequests && (
          <div className="online-users" style={{ borderBottom: '1px solid #3a3a3a' }}>
            <h4>Friend Requests ({friendRequests.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {friendRequests.map(req => (
                <div key={req._id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px',
                  background: '#2d2d2d',
                  borderRadius: '8px'
                }}>
                  <img src={req.from.avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                  <span style={{ flex: 1 }}>{req.from.username}</span>
                  <button 
                    onClick={() => acceptFriendRequest(req.from._id)}
                    style={{
                      background: '#4CAF50',
                      border: 'none',
                      padding: '5px 10px',
                      borderRadius: '5px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button 
                    onClick={() => rejectFriendRequest(req.from._id)}
                    style={{
                      background: '#f44336',
                      border: 'none',
                      padding: '5px 10px',
                      borderRadius: '5px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    ✗
                  </button>
                </div>
              ))}
              {friendRequests.length === 0 && (
                <p style={{ color: '#999', textAlign: 'center' }}>No pending requests</p>
              )}
            </div>
          </div>
        )}

        {showAllUsers && (
          <div className="online-users" style={{ borderBottom: '1px solid #3a3a3a', maxHeight: '300px', overflowY: 'auto' }}>
            <h4>All Users ({allUsers.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allUsers.map(u => (
                <div key={u._id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px',
                  background: '#2d2d2d',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => u.isFriend && handleUserClick(u._id, true)}
                >
                  <img src={u.avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', border: u.isOnline ? '2px solid #4CAF50' : '2px solid #666' }} />
                  <div style={{ flex: 1 }}>
                    <div>{u.username}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      {u.isOnline ? '🟢 Online' : '⚫ Offline'}
                    </div>
                  </div>
                  {u.isFriend ? (
                    <span style={{ color: '#4CAF50', fontSize: '12px' }}>✓ Friends</span>
                  ) : u.requestSent ? (
                    <span style={{ color: '#FF6B35', fontSize: '12px' }}>⏳ Pending</span>
                  ) : u.requestReceived ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        acceptFriendRequest(u._id);
                      }}
                      style={{
                        background: '#4CAF50',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '5px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Accept
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        sendFriendRequest(u._id);
                      }}
                      style={{
                        background: '#FF6B35',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '5px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="online-users">
          <h4>Online Friends ({onlineUsers.length})</h4>
          <div className="online-user-list">
            {onlineUsers.map(u => (
              <motion.div
                key={u._id}
                className="online-user"
                onClick={() => handleUserClick(u._id, true)}
                whileHover={{ scale: 1.1 }}
              >
                <img src={u.avatar} alt={u.username} />
                <span>{u.username}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="chat-list">
          {/* Individual Chats Section */}
          {individualChats.length > 0 && (
            <>
              <div className="chat-section-header">
                <span>💬 Direct Messages</span>
                <span className="chat-count">{individualChats.length}</span>
              </div>
              {individualChats.map(chat => (
                <ChatItem
                  key={chat._id}
                  chat={chat}
                  isActive={selectedChat?._id === chat._id}
                  onSelect={handleChatSelect}
                  getChatAvatar={getChatAvatar}
                  getChatName={getChatName}
                  unreadCount={unreadCounts[chat._id] || 0}
                />
              ))}
            </>
          )}

          {/* Group Chats Section */}
          {groupChats.length > 0 && (
            <>
              <div className="chat-section-header" style={{ marginTop: '15px' }}>
                <span>👥 Groups</span>
                <span className="chat-count">{groupChats.length}</span>
              </div>
              {groupChats.map(chat => (
                <ChatItem
                  key={chat._id}
                  chat={chat}
                  isActive={selectedChat?._id === chat._id}
                  onSelect={handleChatSelect}
                  getChatAvatar={getChatAvatar}
                  getChatName={getChatName}
                  unreadCount={unreadCounts[chat._id] || 0}
                />
              ))}
            </>
          )}

          {/* Empty State */}
          {chats.length === 0 && (
            <div style={{ 
              padding: '40px 20px', 
              textAlign: 'center', 
              color: '#999' 
            }}>
              <p>No chats yet</p>
              <p style={{ fontSize: '12px', marginTop: '10px' }}>
                Start by adding friends or creating a group
              </p>
            </div>
          )}
        </div>

        {/* Footer with Logout Button */}
        <div className="sidebar-footer">
          <button 
            className="footer-logout-btn" 
            onClick={handleLogout}
            title="Logout"
          >
            <span className="logout-icon">🚪</span>
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </div>

      <div className="chat-area">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <button 
                className="hamburger-btn"
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              >
                ☰
              </button>
              <img src={getChatAvatar(selectedChat)} alt="" className="avatar" />
              <div style={{ flex: 1 }}>
                <h3>
                  {getChatName(selectedChat)}
                  {selectedChat.isGroupChat && (
                    <span className="group-badge-header">👥 Group</span>
                  )}
                </h3>
                {selectedChat.isGroupChat && (
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                    {selectedChat.users?.length || 0} members
                  </div>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <button 
                  className="new-group-btn"
                  onClick={() => setShowChatMenu(!showChatMenu)}
                  style={{ padding: '8px 15px' }}
                >
                  ⋮
                </button>
                {showChatMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    right: '0',
                    background: '#2d2d2d',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    minWidth: '150px'
                  }}>
                    <button
                      onClick={clearChat}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        color: '#ff4444',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '14px'
                      }}
                      onMouseOver={(e) => e.target.style.background = '#3a3a3a'}
                      onMouseOut={(e) => e.target.style.background = 'transparent'}
                    >
                      🗑️ Clear Chat
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="messages-container">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`message ${msg.sender._id === user._id ? 'own' : ''}`}
                >
                  <img src={msg.sender.avatar} alt="" className="message-avatar" />
                  <div className="message-content">
                    {msg.sender._id !== user._id && (
                      <div className="message-sender">{msg.sender.username}</div>
                    )}
                    <div className="message-text">{msg.content}</div>
                    <div className="message-time">
                      {formatTime(msg.createdAt)}
                      {msg.sender._id === user._id && (
                        <span className="message-status">
                          {isMessageRead(msg) ? (
                            <span className="status-seen">✓✓ Seen</span>
                          ) : (
                            <span className="status-delivered">✓ Delivered</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && <div className="typing-indicator">Typing...</div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-container">
              <button className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                😊
              </button>
              
              {showEmojiPicker && (
                <div className="emoji-picker-container">
                  <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
                </div>
              )}

              <form onSubmit={sendMessage} style={{ display: 'flex', flex: 1, gap: '10px' }}>
                <input
                  type="text"
                  className="message-input"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={handleTyping}
                />
                <button type="submit" className="send-btn">Send</button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <button 
              className="hamburger-btn mobile-only"
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              style={{ position: 'absolute', top: '20px', left: '20px' }}
            >
              ☰
            </button>
            <h2>💬 Welcome to Chat App</h2>
            <p>Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {showGroupModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-content"
            style={{
              background: '#252525',
              padding: '30px',
              borderRadius: '15px',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ color: '#FF6B35', marginBottom: '20px' }}>Create Group</h3>
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#1a1a1a',
                border: '1px solid #3a3a3a',
                borderRadius: '8px',
                color: 'white',
                marginBottom: '20px'
              }}
            />
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
              {getFriends().map(u => (
                <div
                  key={u._id}
                  onClick={() => {
                    if (selectedUsers.includes(u._id)) {
                      setSelectedUsers(selectedUsers.filter(id => id !== u._id));
                    } else {
                      setSelectedUsers([...selectedUsers, u._id]);
                    }
                  }}
                  style={{
                    padding: '10px',
                    background: selectedUsers.includes(u._id) ? '#FF6B35' : '#2d2d2d',
                    marginBottom: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <img src={u.avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                  <span>{u.username}</span>
                </div>
              ))}
              {getFriends().length === 0 && (
                <p style={{ color: '#999', textAlign: 'center' }}>Add friends first to create a group</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={createGroup} className="new-group-btn" style={{ flex: 1 }}>
                Create
              </button>
              <button 
                onClick={() => setShowGroupModal(false)} 
                className="new-group-btn"
                style={{ flex: 1, background: '#666' }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </div>
    </>
  );
};

export default Chat;
