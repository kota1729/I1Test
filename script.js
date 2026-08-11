const firebaseConfig = {
    apiKey: "AIzaSyCt1XIlg61RTPOWhOq_BU6rl4md7RZwvqk",
    authDomain: "quiz-system-pro-app.firebaseapp.com",
    projectId: "quiz-system-pro-app",
    storageBucket: "quiz-system-pro-app.appspot.com",
    messagingSenderId: "699736973166",
    appId: "1:699736973166:web:55c90c30017cc981e9ab7f",
    measurementId: "G-3S64YEK4ZX"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// --- 処理中オーバーレイ / トースト通知 ---
// 通信が発生する処理の前後で呼び出し、画面が固まったように見える
// ことがないようにする。
let loadingDepth = 0;
let loadingStuckTimer = null;
// このミリ秒数、オーバーレイが消えないまま表示され続けたら、
// 「通信に時間がかかっています」というヒント（＋再読み込みボタン）を出す。
// これは個々の処理にタイムアウトを付け忘れていた場合でも、
// 画面がずっと固まって見えることが絶対に無いようにするための保険。
const LOADING_STUCK_HINT_MS = 7000;

function showLoading(text = '処理中...') {
    loadingDepth++;
    const el = document.getElementById('loading-overlay');
    document.getElementById('loading-overlay-text').innerText = text;
    el.classList.add('active');
    armLoadingStuckTimer();
}
function hideLoading() {
    loadingDepth = Math.max(0, loadingDepth - 1);
    if (loadingDepth === 0) {
        document.getElementById('loading-overlay').classList.remove('active');
        disarmLoadingStuckTimer();
    }
}
function updateLoadingText(text) {
    const el = document.getElementById('loading-overlay-text');
    if (el) el.innerText = text;
    // 新しい処理段階に進んだとみなし、固まり判定タイマーを仕切り直す。
    armLoadingStuckTimer();
}
function armLoadingStuckTimer() {
    disarmLoadingStuckTimer();
    loadingStuckTimer = setTimeout(() => {
        const hintEl = document.getElementById('loading-overlay-hint');
        if (hintEl) hintEl.classList.add('show');
    }, LOADING_STUCK_HINT_MS);
}
function disarmLoadingStuckTimer() {
    if (loadingStuckTimer) {
        clearTimeout(loadingStuckTimer);
        loadingStuckTimer = null;
    }
    const hintEl = document.getElementById('loading-overlay-hint');
    if (hintEl) hintEl.classList.remove('show');
}

function notifySyncError(what) {
    const wrap = document.getElementById('sync-toast-wrap');
    if (!wrap) return;
    const toast = document.createElement('div');
    toast.className = 'sync-toast error';
    toast.innerText = `⚠ ${what}の保存に失敗しました。通信環境をご確認ください。`;
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 通信状況が極端に悪い場合に、画面が「一生」固まって見えることを防ぐための
// タイムアウト付きラッパー。指定時間内に処理が終わらなければエラーとして
// reject するので、呼び出し側でエラー表示・再試行に繋げられる。
function withTimeout(promise, ms, timeoutMessage) {
    let timerId;
    const timeout = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            reject(new Error(timeoutMessage || `処理がタイムアウトしました（${ms / 1000}秒）`));
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

// Firebase Authenticationはメール形式のIDを要求するため、
// ユーザーが入力する「ユーザーID」を内部的にダミーのメールアドレスに変換して使う。
// このメールアドレスは実際には送信されず、ログインの識別にのみ使われる。
const EMAIL_DOMAIN = "quiz-system-pro-app.local";
function usernameToEmail(username) {
    return username.toLowerCase() + "@" + EMAIL_DOMAIN;
}

const USERNAME_RULE_REGEX = /^[A-Za-z0-9_-]{3,20}$/;
function isValidUsername(u) {
    return USERNAME_RULE_REGEX.test(u);
}

async function fetchUserData(uid) {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function saveUserData(uid, data) {
    await db.collection('users').doc(uid).set(data, { merge: true });
}

// --- 管理者判定 ---
// 「管理者かどうか」は system/admin ドキュメントに保存された adminUid
// （Firebase Authenticationが発行する本物のUID）と、
// 現在ログイン中のユーザーのUIDが一致するかどうかで判定する。
// パスワードそのものはFirebase Authenticationが安全に管理し、
// クライアントやFirestoreからは一切参照できない。
let adminUidCache = null;
async function getAdminUid(forceRefresh = false) {
    if (adminUidCache !== null && !forceRefresh) return adminUidCache;
    const ref = db.collection('system').doc('admin');
    const doc = await ref.get();
    adminUidCache = doc.exists ? (doc.data().adminUid || null) : null;
    return adminUidCache;
}
function invalidateAdminUidCache() {
    adminUidCache = null;
}

function toggleAdminPassword(btn, inputId) {

    const input =
        document.getElementById(inputId);

    if (input.type === "password") {

        input.type = "text";
        btn.innerText = "隠す";

    } else {

        input.type = "password";
        btn.innerText = "表示";

    }
}

function toggleAuthPasswordVisibility(btn) {
    const input = document.getElementById('auth-password');
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = '隠す';
    } else {
        input.type = 'password';
        btn.innerText = '表示';
    }
}

function toggleRegisterPasswordVisibility(btn) {
    const input = document.getElementById('register-password');
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = '隠す';
    } else {
        input.type = 'password';
        btn.innerText = '表示';
    }
}

const PASSWORD_RULE_REGEX = /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9]{8,}$/;
const PASSWORD_HAS_NUMBER_REGEX = /[0-9]/;
const PASSWORD_HAS_ALPHA_REGEX = /[A-Za-z]/;
const PASSWORD_CHARSET_ONLY_REGEX = /^[A-Za-z0-9]*$/;

function isValidPassword(pw) {
    return PASSWORD_RULE_REGEX.test(pw);
}

function updatePasswordRuleStatus() {
    const pw = document.getElementById('register-password').value;

    const checks = {
        'rule-length': pw.length >= 8,
        'rule-number': PASSWORD_HAS_NUMBER_REGEX.test(pw),
        'rule-alpha': PASSWORD_HAS_ALPHA_REGEX.test(pw),
        'rule-charset': pw.length > 0 && PASSWORD_CHARSET_ONLY_REGEX.test(pw)
    };

    Object.keys(checks).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('valid', checks[id]);
        el.classList.toggle('invalid', !checks[id]);
    });

    const statusEl = document.getElementById('pw-match-status');
    if (statusEl) {
        if (pw.length === 0) {
            statusEl.textContent = '';
            statusEl.className = 'pw-match-status';
        } else if (isValidPassword(pw)) {
            statusEl.textContent = '✓ すべての条件を満たしています';
            statusEl.className = 'pw-match-status ok';
        } else {
            statusEl.textContent = 'まだ条件を満たしていません';
            statusEl.className = 'pw-match-status ng';
        }
    }
}

function showRegisterScreen() {
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('register-screen').style.display = 'block';
    document.getElementById('register-userid').value = '';
    document.getElementById('register-password').value = '';
    updatePasswordRuleStatus();
}

function showLoginScreen() {
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('auth-userid').value = '';
    document.getElementById('auth-password').value = '';
}

let currentUser = null;      // Firestore/Firebase AuthのUID（内部処理用）
let currentUsername = null;  // 画面表示用のユーザーID
let isAdminSession = false;
let currentSubject = null;
let currentMode = 1;
let activeQuestions = [];
let currentIndex = 0;

function getSubjectList() {
    return Object.values(window.QUIZ_SUBJECTS || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function getSubjectName(subjectId) {
    const subj = (window.QUIZ_SUBJECTS || {})[subjectId];
    return subj ? subj.name : subjectId;
}
function getActiveSubjectQuestions() {
    const subj = (window.QUIZ_SUBJECTS || {})[currentSubject];
    return subj ? subj.questions : [];
}

function showCustomAlert(message, title = "通知") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;

        const btnContainer = document.getElementById('modal-btns');
        btnContainer.innerHTML = '';

        const okBtn = document.createElement('button');
        okBtn.className = 'btn btn-main';
        okBtn.style.padding = '10px 20px';
        okBtn.innerText = 'OK';
        okBtn.onclick = () => {
            modal.classList.remove('active');
            resolve(true);
        };

        btnContainer.appendChild(okBtn);
        modal.classList.add('active');
    });
}

function showCustomConfirm(message, title = "確認") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;

        const btnContainer = document.getElementById('modal-btns');
        btnContainer.innerHTML = '';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-sub';
        cancelBtn.style.padding = '10px 20px';
        cancelBtn.innerText = 'キャンセル';
        cancelBtn.onclick = () => {
            modal.classList.remove('active');
            resolve(false);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.style.padding = '10px 20px';
        confirmBtn.innerText = '実行する';
        confirmBtn.onclick = () => {
            modal.classList.remove('active');
            resolve(true);
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        modal.classList.add('active');
    });
}

async function getUsersData() {
    const snapshot = await db.collection('users').get();
    const users = {};
    snapshot.forEach(doc => { users[doc.id] = doc.data(); });
    return users;
}

// 以下は「特定の他ユーザー」を対象にした低レベルな読み書き（管理者が
// 他人のデータを操作する時専用）。存在チェックの事前読み込みは、通信の
// 往復を1回減らすために省略している（merge:trueなら該当ドキュメントが
// 無くても自動的に作られるため、事前確認は不要）。
async function getUserStars(uid, subjectId) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return [];
    const data = doc.data();
    if (!data.starred || typeof data.starred !== 'object' || Array.isArray(data.starred)) {
        return [];
    }
    return data.starred[subjectId] || [];
}

async function setUserStars(uid, subjectId, starsArray) {
    await db.collection('users').doc(uid).set({ starred: { [subjectId]: starsArray } }, { merge: true });
}

async function getAdminDoc() {
    const ref = db.collection('system').doc('admin');
    const doc = await ref.get();
    return doc.exists ? doc.data() : {};
}

async function getAdminStars(subjectId) {
    const data = await getAdminDoc();
    return (data.stars && data.stars[subjectId]) || [];
}
async function saveAdminStars(subjectId, starsArray) {
    await db.collection('system').doc('admin').set({ stars: { [subjectId]: starsArray } }, { merge: true });
}

// --- メモ機能（他ユーザー操作用の低レベル関数） ---
async function getUserMemos(uid, subjectId) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return {};
    const data = doc.data();
    if (!data.memos || typeof data.memos !== 'object') return {};
    return data.memos[subjectId] || {};
}
async function setUserMemo(uid, subjectId, idx, text) {
    await db.collection('users').doc(uid).set({ memos: { [subjectId]: { [idx]: text } } }, { merge: true });
}
async function getAdminMemos(subjectId) {
    const data = await getAdminDoc();
    return (data.memos && data.memos[subjectId]) || {};
}
async function saveAdminMemo(subjectId, idx, text) {
    await db.collection('system').doc('admin').set({ memos: { [subjectId]: { [idx]: text } } }, { merge: true });
}

// --- ログイン中セッションのキャッシュ層 ---
// ログイン直後に自分（管理者の場合は system/admin）のドキュメントを
// 一度だけ読み込み、以降の画面遷移や★の切り替えはメモリ上のこの
// キャッシュを即座に読み書きする。保存だけを裏側で非同期に行うことで、
// 「ランダム出題を選ぶたびに毎回サーバーへ読みに行って白画面になる」
// 「★を押しても通信が終わるまで反映されない」といった遅延を無くす。
let sessionStars = {};   // { subjectId: [idx, ...] }
let sessionMemos = {};   // { subjectId: { idx: text } }
let sessionDataReady = false;

function sessionDocRef() {
    return isAdminSession
        ? db.collection('system').doc('admin')
        : db.collection('users').doc(currentUser);
}

async function loadSessionData(forceRefresh = false) {
    if (sessionDataReady && !forceRefresh) return;
    const doc = await sessionDocRef().get();
    const data = doc.exists ? doc.data() : {};

    const starField = isAdminSession ? data.stars : data.starred;
    sessionStars = (starField && typeof starField === 'object' && !Array.isArray(starField)) ? starField : {};

    const memoField = data.memos;
    sessionMemos = (memoField && typeof memoField === 'object') ? memoField : {};

    sessionDataReady = true;
}

function resetSessionCache() {
    sessionStars = {};
    sessionMemos = {};
    sessionDataReady = false;
}

function getSessionStars(subjectId) {
    return (sessionStars[subjectId] || []).slice();
}

function getSessionMemos(subjectId) {
    return sessionMemos[subjectId] || {};
}

// ★の一覧をその場でキャッシュに反映しつつ、保存は裏で行う（待たない）。
function setSessionStars(subjectId, starsArray) {
    sessionStars[subjectId] = starsArray;
    const field = isAdminSession ? 'stars' : 'starred';
    sessionDocRef().set({ [field]: { [subjectId]: starsArray } }, { merge: true })
        .catch(err => {
            console.error(err);
            notifySyncError('★');
        });
}

// メモは入力の度に呼ばれるため、キャッシュ更新は同期・保存はPromiseを返して
// 呼び出し側（scheduleMemoSave等）でデバウンス保存の完了待ちに使えるようにする。
async function setSessionMemo(subjectId, idx, text) {
    sessionMemos[subjectId] = sessionMemos[subjectId] || {};
    sessionMemos[subjectId][idx] = text;
    const field = 'memos';
    try {
        await sessionDocRef().set({ [field]: { [subjectId]: { [idx]: text } } }, { merge: true });
    } catch (err) {
        console.error(err);
        notifySyncError('メモ');
    }
}

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// メモ入力後、少し待ってから自動保存する（連打・連続入力での書き込みすぎを防ぐ）
const memoSaveTimers = {};
function scheduleMemoSave(key, saveFn, statusElId) {
    const statusEl = document.getElementById(statusElId);
    if (statusEl) {
        statusEl.textContent = '入力中…';
        statusEl.classList.remove('saved');
    }
    if (memoSaveTimers[key]) clearTimeout(memoSaveTimers[key]);
    memoSaveTimers[key] = setTimeout(async () => {
        await saveFn();
        if (statusEl) {
            statusEl.textContent = '✓ 保存しました';
            statusEl.classList.add('saved');
        }
    }, 700);
}

async function handleRegister() {
    const uid = document.getElementById('register-userid').value.trim();
    const pw = document.getElementById('register-password').value.trim();

    if (!uid || !pw) { await showCustomAlert("ユーザーIDとパスワードを入力してください。", "入力エラー"); return; }

    if (!isValidUsername(uid)) {
        await showCustomAlert(
            "ユーザーIDの条件を満たしていません。\n・3〜20文字\n・使用できるのは半角英数字と「_」「-」のみです",
            "入力エラー"
        );
        return;
    }

    if (!isValidPassword(pw)) {
        await showCustomAlert(
            "パスワードの条件を満たしていません。\n・8文字以上\n・半角の数字とローマ字を両方含む\n・使用できるのは半角英数字のみ（日本語・記号は使用不可）",
            "パスワードエラー"
        );
        return;
    }

    const btn = document.getElementById('register-btn');
    const originalLabel = btn.innerText;
    btn.disabled = true;
    btn.innerText = '登録中...';
    showLoading('登録中...');

    try {
        // パスワードはFirestoreには一切保存せず、Firebase Authenticationに
        // 安全に管理させる（ユーザーIDはダミーのメールアドレスに変換して使用）。
        const email = usernameToEmail(uid);
        const cred = await auth.createUserWithEmailAndPassword(email, pw);

        await db.collection('users').doc(cred.user.uid).set({
            username: uid,
            starred: {}
        });

        // system/admin ドキュメントに adminUid がまだ設定されていない場合
        // （ドキュメント自体が存在しない場合、または旧バージョンから残っている
        // 場合の両方を含む）＝実質的な初回登録時のみ、最初に登録したアカウントを
        // 自動的に管理者として登録する。
        // { merge: true } にすることで、旧バージョンの system/admin に入っていた
        // stars/memos（管理者の★・メモの共有データ）は消さずに残す。
        const adminRef = db.collection('system').doc('admin');
        const adminDoc = await adminRef.get();
        if (!adminDoc.exists || !adminDoc.data().adminUid) {
            await adminRef.set({ adminUid: cred.user.uid }, { merge: true });
            invalidateAdminUidCache();
        }

        await auth.signOut();

        await showCustomAlert("アカウントを作成しました！ログインしてください。", "登録完了");
        showLoginScreen();
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/email-already-in-use') {
            await showCustomAlert("このユーザーIDは既に使用されています。", "登録エラー");
        } else if (error.code === 'auth/weak-password') {
            await showCustomAlert("パスワードが弱すぎます。別のパスワードをお試しください。", "登録エラー");
        } else {
            await showCustomAlert("登録に失敗しました。インターネット接続を確認してください。", "エラー");
        }
    } finally {
        hideLoading();
        btn.disabled = false;
        btn.innerText = originalLabel;
    }
}

async function handleLogin() {
    const uid = document.getElementById('auth-userid').value.trim();
    const pw = document.getElementById('auth-password').value.trim();

    if (!uid || !pw) { await showCustomAlert("ユーザーIDとパスワードを入力してください。", "入力エラー"); return; }

    const btn = document.getElementById('login-btn');
    const originalLabel = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'ログイン中...';
    showLoading('ログイン中...');

    try {
        // パスワードの検証はFirebase Authenticationがサーバー側で安全に行う。
        // Firestoreからパスワードを読み取って比較するようなことは一切しない。
        const email = usernameToEmail(uid);
        const cred = await withTimeout(
            auth.signInWithEmailAndPassword(email, pw),
            15000,
            "ログイン処理がタイムアウトしました。通信環境をご確認のうえ、もう一度お試しください。"
        );
        const authUid = cred.user.uid;

        const adminUid = await withTimeout(
            getAdminUid(),
            10000,
            "サーバーとの通信がタイムアウトしました。通信環境をご確認のうえ、もう一度お試しください。"
        );
        const isAdmin = (adminUid === authUid);

        currentUser = authUid;
        currentUsername = uid;
        isAdminSession = isAdmin;

        // ★とメモを先に読み込んでキャッシュしておくことで、この後の
        // 画面遷移（教科選択・メニュー・出題など）を通信待ちなしで
        // 一瞬で表示できるようにする。
        // ※ここでは showLoading() を再度呼ばない（呼ぶとオーバーレイの
        //   表示カウンターがずれて、処理完了後もオーバーレイが消えなくなる
        //   ため）。表示中のテキストだけ更新する。
        btn.innerText = 'データを準備中...';
        updateLoadingText('データを準備中...');
        resetSessionCache();
        await withTimeout(
            loadSessionData(),
            10000,
            "データの読み込みがタイムアウトしました。通信環境をご確認のうえ、もう一度お試しください。"
        );

        hideLoading();
        showSubjectScreen();
        if (isAdmin) {
            await showCustomAlert("管理者アカウントにログインしました。", "管理者ログイン");
        }
    } catch (error) {
        hideLoading();
        console.error(error);
        if (error && error.message && error.message.includes('タイムアウト')) {
            await showCustomAlert(error.message, "通信エラー");
        } else if (error.code === 'auth/too-many-requests') {
            await showCustomAlert("試行回数が多すぎます。しばらく待ってから再度お試しください。", "ログインエラー");
        } else {
            // セキュリティ上（他人のIDが実在するかどうかを外部から調べられないようにするため）、
            // 「IDが存在しない」場合と「パスワードが違う」場合をあえて区別せず、
            // 同じメッセージで案内する。
            await showCustomAlert("ユーザーIDまたはパスワードが正しくありません。", "ログインエラー");
        }
    } finally {
        btn.disabled = false;
        btn.innerText = originalLabel;
    }
}

function handleLogout() {
    auth.signOut();
    currentUser = null;
    currentUsername = null;
    isAdminSession = false;
    currentSubject = null;
    resetSessionCache();
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('auth-userid').value = '';
    document.getElementById('auth-password').value = '';
}

async function deleteOwnAccount() {
    if (isAdminSession) {
        await showCustomAlert("管理者アカウントは絶対に削除できません。", "エラー");
        return;
    }

    const confirmed = await showCustomConfirm("本当にあなたのアカウントと★データ（すべての教科分）を完全に削除しますか？\nこの操作は取り消せません。", "アカウント削除");
    if (confirmed) {
        showLoading('削除中...');
        try {
            await db.collection('users').doc(currentUser).delete();
            const user = auth.currentUser;
            if (user) {
                await user.delete();
            }
            hideLoading();
            await showCustomAlert("アカウントを削除しました。", "削除完了");
            handleLogout();
        } catch (error) {
            hideLoading();
            console.error(error);
            if (error.code === 'auth/requires-recent-login') {
                await showCustomAlert("セキュリティのため、一度ログアウトしてから再度ログインし、もう一度お試しください。", "確認が必要です");
                handleLogout();
            } else {
                await showCustomAlert("削除に失敗しました。", "エラー");
            }
        }
    }
}

async function resetMyStars() {
    const subjectName = getSubjectName(currentSubject);
    const confirmed = await showCustomConfirm(`あなたが「${subjectName}」で登録した★（わからない問題）のマークをすべて解除してリセットします。他の教科の★には影響しません。よろしいですか？`, "★のリセット");
    if (confirmed) {
        setSessionStars(currentSubject, []);
        await showCustomAlert("この教科の★データをリセットしました。", "リセット完了");
        await showMainMenu();
    }
}

function showSubjectScreen() {
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('subject-screen').style.display = 'block';
    document.getElementById('display-username-subject').innerText = currentUsername;

    const list = document.getElementById('subject-list');
    list.innerHTML = '';

    const subjects = getSubjectList();

    if (subjects.length === 0) {
        list.innerHTML = `
                    <div style="text-align:left; background:#fff3f3; border:1px solid #e74c3c; border-radius:8px; padding:15px; font-size:13px; line-height:1.7; color:#555;">
                        <strong style="color:var(--accent);">⚠️ 教科データを読み込めませんでした。</strong><br>
                        以下をご確認ください。<br>
                        ・<code>index.html</code> と同じ場所に <code>subjects</code> という名前のフォルダがあるか<br>
                        ・その <code>subjects</code> フォルダの中に <code>joho_shori.js</code> が入っているか<br>
                        ・ファイル名やフォルダ名が変わっていないか（大文字小文字も含めて）<br><br>
                        フォルダ構成の例：<br>
                        <code>index.html</code><br>
                        <code>subjects/joho_shori.js</code><br><br>
                        ダウンロード直後は両方のファイルが同じ階層（フォルダ）に並んでしまうことがあります。その場合は「subjects」という名前のフォルダを新しく作り、その中に joho_shori.js を移動してから index.html を開き直してください。
                    </div>`;
        return;
    }

    subjects.forEach(subj => {
        const btn = document.createElement('button');
        btn.className = 'menu-btn';
        btn.innerHTML = `<span>教科</span> ${subj.name}（全${subj.questions.length}問）`;
        btn.onclick = () => selectSubject(subj.id);
        list.appendChild(btn);
    });
}

async function selectSubject(subjectId) {
    currentSubject = subjectId;
    await showMainMenu();
}

async function showMainMenu() {
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('menu-screen').style.display = 'block';
    document.getElementById('display-username').innerText = currentUsername;
    document.getElementById('menu-subject-name').innerText = getSubjectName(currentSubject);

    const adminBtn = document.getElementById('admin-panel-btn');
    const deleteMyAccBtn = document.getElementById('delete-my-account-btn');

    if (isAdminSession) {
        adminBtn.style.display = 'block';
        deleteMyAccBtn.style.display = 'none';
    } else {
        adminBtn.style.display = 'none';
        deleteMyAccBtn.style.display = 'block';
    }

    const starModeBtn = document.getElementById('menu-star-btn');
    const starCount = getSessionStars(currentSubject).length;

    starModeBtn.innerText = `★ 限定モード (現在 ${starCount} 問)`;
    starModeBtn.disabled = starCount === 0;
}

async function toMainMenu() {
    await showMainMenu();
}

function shuffle(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

async function startMode(modeNum) {
    currentMode = modeNum;
    currentIndex = 0;

    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');

    const questions = getActiveSubjectQuestions();
    const subjectName = getSubjectName(currentSubject);

    // ログイン時に読み込み済みのキャッシュから即座に取得（通信なし）。
    const myStars = getSessionStars(currentSubject);

    if (modeNum === 1) {
        activeQuestions = [...questions];
        document.getElementById('quiz-title').innerText = `${subjectName} - 1問ずつ挑戦（標準順）`;
        await setupQuizScreen();
    } else if (modeNum === 2) {
        document.getElementById('list-title').innerText = `${subjectName} - 全問一気見リスト`;
        await setupListScreen();
    } else if (modeNum === 3) {
        activeQuestions = shuffle(questions);
        document.getElementById('quiz-title').innerText = `${subjectName} - ランダム実力テスト`;
        await setupQuizScreen();
    } else if (modeNum === 4) {
        activeQuestions = questions.filter((_, idx) => myStars.includes(idx));
        document.getElementById('quiz-title').innerText = `${subjectName} - ★ わからない問題 復習テスト`;
        await setupQuizScreen();
    }
}

async function setupQuizScreen() {
    document.getElementById('quiz-screen').style.display = 'block';
    await showQuestion();
}

async function showQuestion() {
    if (currentIndex >= activeQuestions.length) {
        document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
        document.getElementById('result-screen').style.display = 'block';
        return;
    }

    const current = activeQuestions[currentIndex];
    const container = document.getElementById('quiz-a-container');
    container.classList.remove('revealed');

    document.getElementById('quiz-question').innerText = current.q;
    document.getElementById('quiz-answer').innerText = current.a;

    const starBtn = document.getElementById('quiz-star');
    const questions = getActiveSubjectQuestions();
    const originalIdx = questions.findIndex(q => q.q === current.q);

    // キャッシュから同期的に取得するため、問題を送る/戻るたびに
    // サーバーへ読みに行くことがなく、遅延なく次の問題を表示できる。
    const myStars = getSessionStars(currentSubject);
    const myMemos = getSessionMemos(currentSubject);

    if (myStars.includes(originalIdx)) {
        starBtn.classList.add('active');
    } else {
        starBtn.classList.remove('active');
    }

    const memoEl = document.getElementById('quiz-memo');
    memoEl.value = myMemos[originalIdx] || '';
    memoEl.dataset.idx = originalIdx;
    const memoStatusEl = document.getElementById('quiz-memo-status');
    if (memoStatusEl) {
        memoStatusEl.textContent = '';
        memoStatusEl.classList.remove('saved');
    }

    const total = activeQuestions.length;
    document.getElementById('quiz-count').innerText = `第 ${currentIndex + 1} 問 / ${total} 問`;
    document.getElementById('quiz-progress').style.width = `${((currentIndex) / total) * 100}%`;

    const prevBtn = document.getElementById('prev-btn');
    prevBtn.disabled = (currentIndex === 0);
}

function onQuizMemoInput() {
    const memoEl = document.getElementById('quiz-memo');
    const idx = Number(memoEl.dataset.idx);
    scheduleMemoSave('quiz', () => saveMemoValue(idx, memoEl.value), 'quiz-memo-status');
}

async function saveQuizMemoNow() {
    const memoEl = document.getElementById('quiz-memo');
    const idx = Number(memoEl.dataset.idx);
    if (memoSaveTimers['quiz']) clearTimeout(memoSaveTimers['quiz']);
    await saveMemoValue(idx, memoEl.value);
    const statusEl = document.getElementById('quiz-memo-status');
    if (statusEl) {
        statusEl.textContent = '✓ 保存しました';
        statusEl.classList.add('saved');
    }
}

async function saveMemoValue(idx, text) {
    if (isNaN(idx)) return;
    await setSessionMemo(currentSubject, idx, text);
}

// ★ボタンは押した瞬間に見た目を切り替え、保存は裏側で非同期に行う
// （＝しばらく星にならず固まって見える、という遅延を無くす）。
function toggleStarCurrent() {
    const current = activeQuestions[currentIndex];
    const questions = getActiveSubjectQuestions();
    const originalIdx = questions.findIndex(q => q.q === current.q);
    const starBtn = document.getElementById('quiz-star');

    const myStars = getSessionStars(currentSubject);
    const foundIdx = myStars.indexOf(originalIdx);
    if (foundIdx > -1) {
        myStars.splice(foundIdx, 1);
        starBtn.classList.remove('active');
    } else {
        myStars.push(originalIdx);
        starBtn.classList.add('active');
    }
    setSessionStars(currentSubject, myStars);
}

function toggleAnswer(containerEl) {
    containerEl.classList.toggle('revealed');
}

async function nextQuestion() {
    currentIndex++;
    await showQuestion();
}

async function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        await showQuestion();
    }
}

async function setupListScreen() {
    document.getElementById('list-screen').style.display = 'block';
    const container = document.getElementById('list-container');
    container.innerHTML = '<p style="text-align:center; color:#aaa; padding:20px 0;">読み込み中...</p>';

    const questions = getActiveSubjectQuestions();

    // キャッシュから同期的に取得（通信なし）。
    const myStars = getSessionStars(currentSubject);
    const myMemos = getSessionMemos(currentSubject);

    // 問題数が多い教科でもカクつかないよう、要素をDOMに逐次追加するのではなく
    // 文字列としてまとめて組み立ててから一度だけ描画する。
    const htmlParts = questions.map((item, idx) => {
        const isStarred = myStars.includes(idx);
        const starDisplay = `<button class="star-btn ${isStarred ? 'active' : ''}" onclick="toggleStarList(${idx}, this)">★</button>`;
        const memoText = escapeHtml(myMemos[idx] || '');

        return `
                    <div class="qa-card">
                        <div class="card-header">
                            <div class="q-text">問 ${idx + 1}: ${item.q}</div>
                            ${starDisplay}
                        </div>
                        <div class="a-container" onclick="toggleAnswer(this)">
                            <div class="a-text">${item.a}</div>
                            <div class="fusen">タップして付箋をめくる</div>
                        </div>
                        <div class="memo-box">
                            <div class="memo-header">
                                <span class="memo-header-icon">✎</span>
                                <span class="memo-header-text">メモ</span>
                                <span class="memo-status" id="list-memo-status-${idx}"></span>
                            </div>
                            <textarea class="memo-textarea" id="list-memo-${idx}" placeholder="気づいたこと・覚え方のコツなどを書いておこう" oninput="onListMemoInput(${idx})" onblur="saveListMemoNow(${idx})">${memoText}</textarea>
                        </div>
                    </div>
                `;
    });

    container.innerHTML = htmlParts.join('');
}

function onListMemoInput(idx) {
    const memoEl = document.getElementById('list-memo-' + idx);
    scheduleMemoSave('list-' + idx, () => saveMemoValue(idx, memoEl.value), 'list-memo-status-' + idx);
}

async function saveListMemoNow(idx) {
    const memoEl = document.getElementById('list-memo-' + idx);
    const key = 'list-' + idx;
    if (memoSaveTimers[key]) clearTimeout(memoSaveTimers[key]);
    await saveMemoValue(idx, memoEl.value);
    const statusEl = document.getElementById('list-memo-status-' + idx);
    if (statusEl) {
        statusEl.textContent = '✓ 保存しました';
        statusEl.classList.add('saved');
    }
}

function toggleStarList(originalIdx, btnEl) {
    const myStars = getSessionStars(currentSubject);
    const foundIdx = myStars.indexOf(originalIdx);
    if (foundIdx > -1) {
        myStars.splice(foundIdx, 1);
        btnEl.classList.remove('active');
    } else {
        myStars.push(originalIdx);
        btnEl.classList.add('active');
    }
    setSessionStars(currentSubject, myStars);
}

async function showAdminScreen() {
    if (!isAdminSession) return;
    document.querySelectorAll('.window').forEach(el => el.style.display = 'none');
    document.getElementById('admin-screen').style.display = 'block';
    document.getElementById('admin-subject-name').innerText = getSubjectName(currentSubject);

    document.getElementById('admin-current-password').value = '';
    document.getElementById('admin-new-password').value = '';

    const tbody = document.getElementById('admin-user-list');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#aaa;">読み込み中...</td></tr>`;

    let users = await getUsersData();
    const keys = Object.keys(users);

    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#aaa;">登録されているユーザーはいません。</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    keys.forEach(uid => {
        const username = escapeHtml(users[uid].username || '(不明なユーザー)');
        const starred = users[uid].starred;
        const starArr = (starred && typeof starred === 'object' && !Array.isArray(starred)) ? (starred[currentSubject] || []) : [];
        const starCount = starArr.length;
        const isSelf = (uid === currentUser);
        const tr = document.createElement('tr');
        tr.innerHTML = `
                    <td><strong>${username}</strong>${isSelf ? ' <span style="color:#8e44ad; font-size:11px;">（自分＝管理者）</span>' : ''}</td>
                    <td><span style="color:#7f8c8d;">🔒 非公開（暗号化済み）</span></td>
                    <td>${starCount} 問</td>
                    <td>
                        <button class="btn btn-sub" style="padding:5px 8px; font-size:11px; margin-bottom:4px;" onclick="adminResetUserStars('${uid}', '${username}')">★リセット</button>
                        ${isSelf ? '' : `<button class="btn btn-danger" style="padding:5px 10px; font-size:12px;" onclick="adminDeleteUser('${uid}', '${username}')">削除</button>`}
                    </td>
                `;
        tbody.appendChild(tr);
    });
}

async function adminDeleteUser(uid, username) {
    if (!isAdminSession) return;
    if (uid === currentUser) {
        await showCustomAlert("管理者自身のデータは、この画面からは削除できません。", "エラー");
        return;
    }

    if (uid === currentUser) {
        await showCustomAlert("管理者自身のデータは、この画面からは削除できません。", "操作エラー");
        return;
    }

    const confirmed = await showCustomConfirm(`管理者権限で ユーザー「${username}」のデータ（すべての教科分）を完全に削除しますか？\n※ログインアカウント自体（ID・パスワード）は削除されないため、本人が再ログインすると、データが空の状態で新しいアカウントとして使い続けられます。`, "ユーザー強制削除");
    if (confirmed) {
        showLoading('削除中...');
        await db.collection('users').doc(uid).delete();
        hideLoading();
        await showAdminScreen();
    }
}

async function adminResetUserStars(uid, username) {
    if (!isAdminSession) return;

    const subjectName = getSubjectName(currentSubject);
    const confirmed = await showCustomConfirm(`ユーザー「${username}」の教科「${subjectName}」の★データだけをリセットします。他の教科・他のユーザーには影響しません。よろしいですか？`, "ユーザー別★リセット");
    if (confirmed) {
        showLoading('リセット中...');
        await setUserStars(uid, currentSubject, []);
        hideLoading();
        await showCustomAlert(`ユーザー「${username}」の★データ（${subjectName}）をリセットしました。`, "リセット完了");
        await showAdminScreen();
    }
}

async function adminResetAllUsersStars() {
    if (!isAdminSession) return;

    const subjectName = getSubjectName(currentSubject);
    const confirmed = await showCustomConfirm(`【警告】現在の教科「${subjectName}」について、自分を含むすべてのユーザーの★データを完全にリセットします。他の教科の★には影響しません。本当によろしいですか？`, "全ユーザーの★一括リセット");
    if (confirmed) {
        showLoading('全ユーザーをリセット中...');
        const users = await getUsersData();
        const batch = db.batch();
        Object.keys(users).forEach(uid => {
            const ref = db.collection('users').doc(uid);
            batch.set(ref, { starred: { [currentSubject]: [] } }, { merge: true });
        });
        await batch.commit();

        await saveAdminStars(currentSubject, []);
        // 自分（管理者）が今まさに見ているキャッシュにも反映しておく。
        sessionStars[currentSubject] = [];

        hideLoading();
        await showCustomAlert(`すべてのユーザー（管理者含む）の★データ（${subjectName}）をリセットしました。`, "一括リセット完了");
        await showAdminScreen();
    }
}

async function changeAdminCredentials() {
    if (!isAdminSession) return;

    const currentPw = document.getElementById('admin-current-password').value.trim();
    const newPw = document.getElementById('admin-new-password').value.trim();

    if (!currentPw || !newPw) {
        await showCustomAlert("現在のパスワードと新しいパスワードの両方を入力してください。", "入力エラー");
        return;
    }

    if (!isValidPassword(newPw)) {
        await showCustomAlert(
            "パスワードの条件を満たしていません。\n・8文字以上\n・半角の数字とローマ字を両方含む\n・使用できるのは半角英数字のみ（日本語・記号は使用不可）",
            "パスワードエラー"
        );
        return;
    }

    const confirmed = await showCustomConfirm("管理者のパスワードを変更します。よろしいですか？\n変更後は、自動的に一度ログアウトされます。", "確認");
    if (!confirmed) return;

    showLoading('変更中...');
    try {
        const user = auth.currentUser;

        // パスワードの変更はセキュリティ上「最近ログインしたばかり」であることが
        // 求められるため、現在のパスワードで再認証してから変更する。
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
        await user.reauthenticateWithCredential(credential);

        await user.updatePassword(newPw);

        hideLoading();
        await showCustomAlert("管理者のパスワードを更新しました。再度ログインしてください。", "変更完了");
        handleLogout();
    } catch (error) {
        hideLoading();
        console.error(error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            await showCustomAlert("現在のパスワードが正しくありません。", "変更エラー");
        } else if (error.code === 'auth/requires-recent-login') {
            await showCustomAlert("セキュリティのため、一度ログアウトしてから再度ログインし、もう一度お試しください。", "確認が必要です");
        } else {
            await showCustomAlert("変更に失敗しました。", "エラー");
        }
    }
}