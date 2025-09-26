// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCnUImiz-OLoI6T3YkFk-yXOAFXPeUANfw",
    authDomain: "f2-campeonato.firebaseapp.com",
    projectId: "f2-campeonato",
    storageBucket: "f2-campeonato.firebasestorage.app",
    messagingSenderId: "667581747059",
    appId: "1:667581747059:web:54ccd5254353e5bccfff06",
    measurementId: "G-9S30PKEYSJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Application state
class AppState {
    constructor() {
        this.currentUser = null;
        this.currentChampionship = null;
        this.championships = [];
        this.drivers = [];
        this.races = [];
        this.results = {};
        this.comments = {};
        this.votes = {};
    }
}

const state = new AppState();

// UI Controllers
class UIController {
    constructor() {
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Auth elements
        this.loginScreen = document.getElementById('login-screen');
        this.appContent = document.getElementById('app-content');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.googleLoginBtn = document.getElementById('google-login');
        this.authError = document.getElementById('auth-error');

        // Navigation
        this.mainNav = document.getElementById('main-nav');
        this.userNav = document.getElementById('user-nav');
        this.platformBrand = document.getElementById('platform-brand');

        // Championship elements
        this.championshipSelector = document.getElementById('championship-selector');
        this.championshipsGrid = document.getElementById('championships-grid');
        this.championshipDashboard = document.getElementById('championship-dashboard');
        this.createChampionshipBtn = document.getElementById('create-championship-btn');

        // Modals
        this.createChampionshipModal = new bootstrap.Modal(document.getElementById('create-championship-modal'));
        this.raceHubModal = new bootstrap.Modal(document.getElementById('race-hub-modal'));
        this.driverStatsModal = new bootstrap.Modal(document.getElementById('driver-stats-modal'));
    }

    bindEvents() {
        // Auth events
        this.loginForm?.addEventListener('submit', this.handleLogin.bind(this));
        this.registerForm?.addEventListener('submit', this.handleRegister.bind(this));
        this.googleLoginBtn?.addEventListener('click', this.handleGoogleLogin.bind(this));

        // Championship events
        this.createChampionshipBtn?.addEventListener('click', () => this.createChampionshipModal.show());
        document.getElementById('save-championship')?.addEventListener('click', this.handleCreateChampionship.bind(this));
    }

    showError(message) {
        if (this.authError) {
            this.authError.textContent = message;
            this.authError.style.display = 'block';
            setTimeout(() => {
                this.authError.style.display = 'none';
            }, 5000);
        }
    }

    showLoading(element, show = true) {
        if (show) {
            element.classList.add('loading');
        } else {
            element.classList.remove('loading');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            this.showError(error.message);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Create user profile
            await setDoc(doc(db, "users", user.uid), {
                username: username,
                email: email,
                role: "user",
                createdAt: serverTimestamp()
            });
        } catch (error) {
            this.showError(error.message);
        }
    }

    async handleGoogleLogin() {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Check if user profile exists
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                await setDoc(doc(db, "users", user.uid), {
                    username: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    role: "user",
                    createdAt: serverTimestamp()
                });
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    async handleCreateChampionship() {
        const name = document.getElementById('championship-name').value;
        const series = document.getElementById('championship-series').value;
        const season = document.getElementById('championship-season').value;
        const description = document.getElementById('championship-description').value;

        if (!name || !series || !season) {
            this.showError('Please fill in all required fields');
            return;
        }

        try {
            const championshipData = {
                name,
                series,
                season: parseInt(season),
                description,
                createdBy: state.currentUser.uid,
                createdAt: serverTimestamp(),
                drivers: [],
                races: this.getDefaultRaces(series),
                settings: {
                    pointsSystem: this.getDefaultPointsSystem(series),
                    allowComments: true,
                    allowVoting: true
                }
            };

            await addDoc(collection(db, "championships"), championshipData);
            this.createChampionshipModal.hide();
            document.getElementById('create-championship-form').reset();
        } catch (error) {
            this.showError('Failed to create championship: ' + error.message);
        }
    }

    getDefaultRaces(series) {
        const raceTemplates = {
            f2: [
                "Australia (Melbourne)", "France (Paul Ricard)", "Austria (Red Bull Ring)",
                "Canada (Montreal)", "Great Britain (Silverstone)", "Hungary (Hungaroring)",
                "Italy (Monza)", "Belgium (Spa)", "Azerbaijan (Baku)",
                "Singapore (Marina Bay)", "Russia (Sochi)", "Mexico (Hermanos Rodríguez)",
                "Monaco (Monaco)", "Brazil (Interlagos)", "Abu Dhabi (Yas Marina)"
            ],
            f1: [
                "Bahrain", "Saudi Arabia", "Australia", "Japan", "China", "Miami",
                "Emilia Romagna", "Monaco", "Canada", "Spain", "Austria", "Great Britain",
                "Hungary", "Belgium", "Netherlands", "Italy", "Azerbaijan", "Singapore",
                "United States", "Mexico", "Brazil", "Las Vegas", "Qatar", "Abu Dhabi"
            ]
        };

        return raceTemplates[series] || raceTemplates.f2;
    }

    getDefaultPointsSystem(series) {
        return {
            feature: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
            sprint: [15, 12, 10, 8, 6, 4, 2, 1],
            pole: 2,
            fastestLap: 1
        };
    }

    renderNavigation() {
        if (!state.currentUser) return;

        // Main navigation
        const navItems = [
            { id: 'dashboard', label: 'Dashboard', icon: 'speedometer2' },
            { id: 'standings', label: 'Standings', icon: 'trophy' },
            { id: 'races', label: 'Races', icon: 'flag' },
            { id: 'drivers', label: 'Drivers', icon: 'people' },
            { id: 'statistics', label: 'Statistics', icon: 'graph-up' }
        ];

        if (state.currentUser.role === 'admin') {
            navItems.push({ id: 'admin', label: 'Admin', icon: 'gear' });
        }

        this.mainNav.innerHTML = navItems.map(item => `
            <li class="nav-item">
                <a class="nav-link" href="#" data-section="${item.id}">
                    <i class="bi bi-${item.icon} me-2"></i>${item.label}
                </a>
            </li>
        `).join('');

        // User navigation
        this.userNav.innerHTML = `
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                    <i class="bi bi-person-circle me-2"></i>${state.currentUser.username}
                </a>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="#" id="profile-link">
                        <i class="bi bi-person me-2"></i>Profile
                    </a></li>
                    <li><a class="dropdown-item" href="#" id="settings-link">
                        <i class="bi bi-gear me-2"></i>Settings
                    </a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" id="logout-link">
                        <i class="bi bi-box-arrow-right me-2"></i>Logout
                    </a></li>
                </ul>
            </li>
        `;

        // Bind navigation events
        document.getElementById('logout-link')?.addEventListener('click', () => signOut(auth));
    }

    renderChampionships() {
        if (state.championships.length === 0) {
            this.championshipsGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-flag display-1 text-muted"></i>
                    <h4 class="mt-3 text-muted">No Championships Found</h4>
                    <p class="text-muted">Create your first championship to get started</p>
                </div>
            `;
            return;
        }

        this.championshipsGrid.innerHTML = state.championships.map(championship => `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card championship-card h-100" data-championship-id="${championship.id}">
                    <div class="card-body">
                        <h5 class="card-title">${championship.name}</h5>
                        <p class="card-text text-muted">${championship.description || 'No description'}</p>
                        <div class="championship-meta">
                            <span class="badge bg-primary">${championship.series.toUpperCase()}</span>
                            <span class="badge bg-secondary">${championship.season}</span>
                            <small class="text-muted ms-auto">
                                ${championship.drivers?.length || 0} drivers
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Bind championship selection events
        document.querySelectorAll('.championship-card').forEach(card => {
            card.addEventListener('click', () => {
                const championshipId = card.dataset.championshipId;
                this.selectChampionship(championshipId);
            });
        });
    }

    selectChampionship(championshipId) {
        state.currentChampionship = state.championships.find(c => c.id === championshipId);
        if (state.currentChampionship) {
            this.championshipSelector.style.display = 'none';
            this.championshipDashboard.style.display = 'block';
            this.renderChampionshipDashboard();
        }
    }

    renderChampionshipDashboard() {
        if (!state.currentChampionship) return;

        this.championshipDashboard.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <button class="btn btn-outline-secondary btn-sm mb-2" id="back-to-championships">
                        <i class="bi bi-arrow-left me-2"></i>Back to Championships
                    </button>
                    <h2 class="mb-1">${state.currentChampionship.name}</h2>
                    <p class="text-muted mb-0">${state.currentChampionship.series.toUpperCase()} • ${state.currentChampionship.season}</p>
                </div>
                <div class="btn-group" role="group">
                    <button class="btn btn-outline-primary" data-section="standings">Standings</button>
                    <button class="btn btn-outline-primary" data-section="races">Races</button>
                    <button class="btn btn-outline-primary" data-section="drivers">Drivers</button>
                </div>
            </div>

            <div id="dashboard-content">
                ${this.renderStandingsSection()}
            </div>
        `;

        // Bind events
        document.getElementById('back-to-championships')?.addEventListener('click', () => {
            this.championshipSelector.style.display = 'block';
            this.championshipDashboard.style.display = 'none';
            state.currentChampionship = null;
        });
    }

    renderStandingsSection() {
        return `
            <div class="row">
                <div class="col-lg-8">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="bi bi-trophy me-2"></i>Championship Standings
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Pos</th>
                                            <th>Driver</th>
                                            <th>Points</th>
                                            <th>Wins</th>
                                            <th>Podiums</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colspan="5" class="text-center text-muted py-4">
                                                No standings data available
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card mb-4">
                        <div class="card-header">
                            <h6 class="card-title mb-0">Championship Stats</h6>
                        </div>
                        <div class="card-body">
                            <div class="row text-center">
                                <div class="col-6">
                                    <div class="stat-card">
                                        <div class="stat-value text-primary">${state.currentChampionship.drivers?.length || 0}</div>
                                        <div class="stat-label">Drivers</div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="stat-card">
                                        <div class="stat-value text-success">${state.currentChampionship.races?.length || 0}</div>
                                        <div class="stat-label">Races</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h6 class="card-title mb-0">Recent Activity</h6>
                        </div>
                        <div class="card-body">
                            <div class="text-center text-muted py-3">
                                <i class="bi bi-clock-history display-6"></i>
                                <p class="mt-2 mb-0">No recent activity</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Data Controller
class DataController {
    constructor() {
        this.setupRealtimeListeners();
    }

    setupRealtimeListeners() {
        // Listen for championships
        const championshipsQuery = query(
            collection(db, "championships"),
            orderBy("createdAt", "desc")
        );

        onSnapshot(championshipsQuery, (snapshot) => {
            state.championships = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            ui.renderChampionships();
        });
    }

    async createChampionship(data) {
        try {
            const docRef = await addDoc(collection(db, "championships"), {
                ...data,
                createdAt: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            console.error("Error creating championship:", error);
            throw error;
        }
    }

    async updateChampionship(championshipId, data) {
        try {
            await updateDoc(doc(db, "championships", championshipId), data);
        } catch (error) {
            console.error("Error updating championship:", error);
            throw error;
        }
    }

    async deleteChampionship(championshipId) {
        try {
            await deleteDoc(doc(db, "championships", championshipId));
        } catch (error) {
            console.error("Error deleting championship:", error);
            throw error;
        }
    }
}

// Initialize application
const ui = new UIController();
const dataController = new DataController();

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Get user profile
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            state.currentUser = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };
        } else {
            state.currentUser = {
                uid: user.uid,
                email: user.email,
                username: user.email.split('@')[0],
                role: 'user'
            };
        }

        // Show app content
        ui.loginScreen.style.display = 'none';
        ui.appContent.style.display = 'block';
        
        // Show create championship button for admins
        if (state.currentUser.role === 'admin') {
            ui.createChampionshipBtn.style.display = 'block';
        }

        ui.renderNavigation();
        ui.renderChampionships();
    } else {
        // Show login screen
        ui.loginScreen.style.display = 'block';
        ui.appContent.style.display = 'none';
        state.currentUser = null;
    }
});

// Export for global access
window.app = {
    state,
    ui,
    dataController
};