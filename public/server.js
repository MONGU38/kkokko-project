// 꼬꼬너 서버 - 데이터 저장 개선 버전
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 앱 설정
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ANSWERS_FILE = path.join(DATA_DIR, 'answers.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');

// 데이터 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
    console.log('📁 data 폴더 생성됨');
}

// 데이터 저장소
let users = [];
let answers = [];
let matches = [];

// 데이터 로드 함수
function loadData() {
    try {
        // 사용자 데이터 로드
        if (fs.existsSync(USERS_FILE)) {
            const usersData = fs.readFileSync(USERS_FILE, 'utf8');
            users = JSON.parse(usersData);
            console.log(`📊 사용자 데이터 로드: ${users.length}명`);
        }

        // 답변 데이터 로드
        if (fs.existsSync(ANSWERS_FILE)) {
            const answersData = fs.readFileSync(ANSWERS_FILE, 'utf8');
            answers = JSON.parse(answersData);
            console.log(`📊 답변 데이터 로드: ${answers.length}개`);
        }

        // 매칭 데이터 로드
        if (fs.existsSync(MATCHES_FILE)) {
            const matchesData = fs.readFileSync(MATCHES_FILE, 'utf8');
            matches = JSON.parse(matchesData);
            console.log(`📊 매칭 데이터 로드: ${matches.length}개`);
        }

        console.log('✅ 모든 데이터 로드 완료');
    } catch (error) {
        console.error('❌ 데이터 로드 오류:', error.message);
        // 오류 발생시 빈 배열로 초기화
        users = [];
        answers = [];
        matches = [];
    }
}

// 데이터 저장 함수
function saveData() {
    try {
        // 사용자 데이터 저장
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        
        // 답변 데이터 저장
        fs.writeFileSync(ANSWERS_FILE, JSON.stringify(answers, null, 2));
        
        // 매칭 데이터 저장
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(matches, null, 2));
        
        console.log('💾 데이터 저장 완료');
    } catch (error) {
        console.error('❌ 데이터 저장 오류:', error.message);
    }
}

// 서버 시작시 데이터 로드
loadData();

// 정기적으로 데이터 백업 (5분마다)
setInterval(() => {
    saveData();
    console.log('🔄 자동 백업 완료');
}, 5 * 60 * 1000);

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 통계 API (새로 추가)
app.get('/api/stats', (req, res) => {
    const stats = {
        totalUsers: users.length,
        totalAnswers: answers.length,
        totalMatches: matches.length,
        categories: {
            missing: users.filter(u => u.category === 'missing').length,
            separated: users.filter(u => u.category === 'separated').length,
            friends: users.filter(u => u.category === 'friends').length
        }
    };
    
    res.json({ success: true, stats });
});

// 사용자 등록
app.post('/api/register', (req, res) => {
    const { nickname, category } = req.body;
    
    const user = {
        id: Date.now().toString(),
        nickname,
        category,
        createdAt: new Date()
    };
    
    users.push(user);
    console.log('새 사용자 등록:', user);
    
    // 즉시 저장
    saveData();
    
    res.json({ success: true, user });
});

// 답변 저장
app.post('/api/answers', (req, res) => {
    const { userId, category, answersData } = req.body;
    
    const userAnswers = {
        id: Date.now().toString(),
        userId,
        category,
        answers: answersData,
        createdAt: new Date()
    };
    
    answers.push(userAnswers);
    console.log('답변 저장:', userAnswers);
    
    // 즉시 저장
    saveData();
    
    res.json({ success: true, id: userAnswers.id });
});

// 매칭 찾기
app.post('/api/find-matches', (req, res) => {
    const { userId, category } = req.body;
    
    // 현재 사용자의 답변 찾기
    const userAnswers = answers.find(a => a.userId === userId);
    if (!userAnswers) {
        return res.json({ success: false, message: '답변을 찾을 수 없습니다' });
    }
    
    // 같은 카테고리의 다른 답변들과 매칭
    const otherAnswers = answers.filter(a => 
        a.category === category && 
        a.userId !== userId
    );
    
    const matchResults = otherAnswers.map(other => {
        const matchScore = calculateMatchScore(userAnswers.answers, other.answers);
        const otherUser = users.find(u => u.id === other.userId);
        
        return {
            userId: other.userId,
            nickname: otherUser ? otherUser.nickname : '익명',
            score: matchScore,
            category: category
        };
    });
    
    // 매칭 점수 순으로 정렬
    matchResults.sort((a, b) => b.score - a.score);
    
    // 매칭 기록 저장
    if (matchResults.length > 0) {
        const matchRecord = {
            id: Date.now().toString(),
            userId: userId,
            category: category,
            matches: matchResults,
            createdAt: new Date()
        };
        matches.push(matchRecord);
        saveData();
    }
    
    console.log('매칭 결과:', matchResults);
    res.json({ success: true, matches: matchResults.slice(0, 10) });
});

// 간단한 매칭 점수 계산
function calculateMatchScore(answers1, answers2) {
    let score = 0;
    let totalQuestions = 0;
    
    for (const key in answers1) {
        if (answers2[key]) {
            totalQuestions++;
            
            const answer1 = Array.isArray(answers1[key]) ? answers1[key] : [answers1[key]];
            const answer2 = Array.isArray(answers2[key]) ? answers2[key] : [answers2[key]];
            
            // 공통 답변 찾기
            const commonAnswers = answer1.filter(a => answer2.includes(a));
            if (commonAnswers.length > 0) {
                score += commonAnswers.length / Math.max(answer1.length, answer2.length);
            }
        }
    }
    
    return totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
}

// 매칭 상세 정보
app.post('/api/match-details', (req, res) => {
    const { userId1, userId2 } = req.body;
    
    const answers1 = answers.find(a => a.userId === userId1);
    const answers2 = answers.find(a => a.userId === userId2);
    
    if (!answers1 || !answers2) {
        return res.json({ success: false, message: '답변을 찾을 수 없습니다' });
    }
    
    const comparison = {};
    for (const key in answers1.answers) {
        if (answers2.answers[key]) {
            comparison[key] = {
                user1: answers1.answers[key],
                user2: answers2.answers[key],
                match: JSON.stringify(answers1.answers[key]) === JSON.stringify(answers2.answers[key])
            };
        }
    }
    
    res.json({ success: true, comparison });
});

// Socket.io 연결
io.on('connection', (socket) => {
    console.log('사용자 연결:', socket.id);
    
    // 채팅방 입장
    socket.on('join-chat', (data) => {
        const { userId1, userId2 } = data;
        const roomId = [userId1, userId2].sort().join('-');
        socket.join(roomId);
        console.log(`채팅방 입장: ${roomId}`);
    });
    
    // 메시지 전송
    socket.on('send-message', (data) => {
        const { userId1, userId2, message, sender } = data;
        const roomId = [userId1, userId2].sort().join('-');
        
        socket.to(roomId).emit('receive-message', {
            message,
            sender,
            timestamp: new Date()
        });
    });
    
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);
    });
});

// 서버 종료시 데이터 저장
process.on('SIGINT', () => {
    console.log('\n🛑 서버 종료 중...');
    saveData();
    console.log('💾 최종 데이터 저장 완료');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 서버 종료 중...');
    saveData();
    console.log('💾 최종 데이터 저장 완료');
    process.exit(0);
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 꼬꼬너 서버가 http://localhost:${PORT} 에서 실행중입니다!`);
    console.log('📊 현재 데이터 현황:');
    console.log(`   👥 사용자: ${users.length}명`);
    console.log(`   📝 답변: ${answers.length}개`);
    console.log(`   💕 매칭: ${matches.length}개`);
    console.log('Ctrl+C 를 눌러서 서버를 종료할 수 있습니다.');
});