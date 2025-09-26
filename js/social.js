// Social features module
import { 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    increment 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export class SocialController {
    constructor(db, state) {
        this.db = db;
        this.state = state;
        this.comments = new Map();
        this.votes = new Map();
    }

    // Comments system
    async addComment(raceId, content, parentId = null) {
        if (!this.state.currentUser || !content.trim()) return;

        try {
            const commentData = {
                raceId,
                content: content.trim(),
                authorId: this.state.currentUser.uid,
                authorName: this.state.currentUser.username,
                parentId,
                createdAt: serverTimestamp(),
                likes: 0,
                replies: 0
            };

            const docRef = await addDoc(collection(this.db, "comments"), commentData);
            
            // If it's a reply, increment parent's reply count
            if (parentId) {
                await updateDoc(doc(this.db, "comments", parentId), {
                    replies: increment(1)
                });
            }

            return docRef.id;
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async deleteComment(commentId) {
        if (!this.state.currentUser) return;

        try {
            await deleteDoc(doc(this.db, "comments", commentId));
        } catch (error) {
            console.error("Error deleting comment:", error);
            throw error;
        }
    }

    async likeComment(commentId) {
        if (!this.state.currentUser) return;

        try {
            const likeData = {
                commentId,
                userId: this.state.currentUser.uid,
                createdAt: serverTimestamp()
            };

            await addDoc(collection(this.db, "comment_likes"), likeData);
            await updateDoc(doc(this.db, "comments", commentId), {
                likes: increment(1)
            });
        } catch (error) {
            console.error("Error liking comment:", error);
            throw error;
        }
    }

    // Voting system
    async submitVote(raceId, category, option) {
        if (!this.state.currentUser) return;

        try {
            const voteData = {
                raceId,
                category, // 'driver_of_the_day', 'best_overtake', etc.
                option,
                userId: this.state.currentUser.uid,
                userName: this.state.currentUser.username,
                createdAt: serverTimestamp()
            };

            // Check if user already voted in this category
            const existingVoteQuery = query(
                collection(this.db, "votes"),
                where("raceId", "==", raceId),
                where("category", "==", category),
                where("userId", "==", this.state.currentUser.uid)
            );

            const existingVotes = await getDocs(existingVoteQuery);
            
            // Delete existing vote if any
            existingVotes.forEach(async (doc) => {
                await deleteDoc(doc.ref);
            });

            // Add new vote
            await addDoc(collection(this.db, "votes"), voteData);
        } catch (error) {
            console.error("Error submitting vote:", error);
            throw error;
        }
    }

    async getVoteResults(raceId, category) {
        try {
            const votesQuery = query(
                collection(this.db, "votes"),
                where("raceId", "==", raceId),
                where("category", "==", category)
            );

            const snapshot = await getDocs(votesQuery);
            const results = {};

            snapshot.forEach(doc => {
                const vote = doc.data();
                results[vote.option] = (results[vote.option] || 0) + 1;
            });

            return results;
        } catch (error) {
            console.error("Error getting vote results:", error);
            return {};
        }
    }

    // Real-time listeners
    setupCommentsListener(raceId, callback) {
        const commentsQuery = query(
            collection(this.db, "comments"),
            where("raceId", "==", raceId),
            orderBy("createdAt", "desc")
        );

        return onSnapshot(commentsQuery, (snapshot) => {
            const comments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(comments);
        });
    }

    setupVotesListener(raceId, callback) {
        const votesQuery = query(
            collection(this.db, "votes"),
            where("raceId", "==", raceId)
        );

        return onSnapshot(votesQuery, (snapshot) => {
            const votes = {};
            snapshot.docs.forEach(doc => {
                const vote = doc.data();
                if (!votes[vote.category]) {
                    votes[vote.category] = {};
                }
                votes[vote.category][vote.option] = (votes[vote.category][vote.option] || 0) + 1;
            });
            callback(votes);
        });
    }

    // UI Rendering methods
    renderCommentsSection(raceId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="comments-section">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6><i class="bi bi-chat-dots me-2"></i>Race Discussion</h6>
                    <button class="btn btn-sm btn-outline-primary" data-bs-toggle="collapse" data-bs-target="#comment-form-${raceId}">
                        <i class="bi bi-plus-lg me-1"></i>Add Comment
                    </button>
                </div>

                <div class="collapse" id="comment-form-${raceId}">
                    <div class="card card-body mb-3">
                        <div class="mb-3">
                            <textarea class="form-control" id="comment-input-${raceId}" rows="3" placeholder="Share your thoughts about this race..."></textarea>
                        </div>
                        <div class="d-flex justify-content-end gap-2">
                            <button class="btn btn-sm btn-secondary" data-bs-toggle="collapse" data-bs-target="#comment-form-${raceId}">Cancel</button>
                            <button class="btn btn-sm btn-primary" onclick="app.social.submitComment('${raceId}')">Post Comment</button>
                        </div>
                    </div>
                </div>

                <div id="comments-list-${raceId}">
                    <div class="text-center text-muted py-3">
                        <div class="spinner"></div>
                        <p class="mt-2">Loading comments...</p>
                    </div>
                </div>
            </div>
        `;

        // Setup real-time listener
        this.setupCommentsListener(raceId, (comments) => {
            this.renderCommentsList(raceId, comments);
        });
    }

    renderCommentsList(raceId, comments) {
        const container = document.getElementById(`comments-list-${raceId}`);
        if (!container) return;

        if (comments.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-chat display-6"></i>
                    <p class="mt-2">No comments yet. Be the first to share your thoughts!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="comment-box" data-comment-id="${comment.id}">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="comment-author">${comment.authorName}</span>
                        <small class="comment-time ms-2">${this.formatTime(comment.createdAt)}</small>
                    </div>
                    <div class="comment-actions">
                        <button class="btn btn-sm btn-link text-muted p-0 me-2" onclick="app.social.likeComment('${comment.id}')">
                            <i class="bi bi-heart"></i> ${comment.likes || 0}
                        </button>
                        ${comment.authorId === this.state.currentUser?.uid ? 
                            `<button class="btn btn-sm btn-link text-danger p-0" onclick="app.social.deleteComment('${comment.id}')">
                                <i class="bi bi-trash"></i>
                            </button>` : ''
                        }
                    </div>
                </div>
                <p class="mb-2">${comment.content}</p>
                ${comment.replies > 0 ? `<small class="text-muted">${comment.replies} replies</small>` : ''}
            </div>
        `).join('');
    }

    renderVotingSection(raceId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const votingCategories = [
            {
                id: 'driver_of_the_day',
                title: 'Driver of the Day',
                icon: 'person-check',
                options: this.state.currentChampionship?.drivers || []
            },
            {
                id: 'best_overtake',
                title: 'Best Overtake',
                icon: 'arrow-right-circle',
                options: ['Turn 1 Battle', 'DRS Zone Pass', 'Late Braking Move', 'Around the Outside', 'Other']
            },
            {
                id: 'race_rating',
                title: 'Race Rating',
                icon: 'star',
                options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐']
            }
        ];

        container.innerHTML = `
            <div class="voting-section">
                <h6 class="mb-3"><i class="bi bi-hand-thumbs-up me-2"></i>Community Voting</h6>
                <div class="row">
                    ${votingCategories.map(category => `
                        <div class="col-md-4 mb-4">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="bi bi-${category.icon} me-2"></i>${category.title}
                                    </h6>
                                    <div class="voting-options" id="voting-${category.id}-${raceId}">
                                        ${category.options.map(option => `
                                            <button class="btn btn-outline-secondary btn-sm w-100 mb-2 vote-option" 
                                                    data-category="${category.id}" 
                                                    data-option="${option}"
                                                    onclick="app.social.vote('${raceId}', '${category.id}', '${option}')">
                                                ${option}
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div class="vote-results mt-3" id="results-${category.id}-${raceId}">
                                        <!-- Results will be populated here -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Setup real-time listener for votes
        this.setupVotesListener(raceId, (votes) => {
            this.renderVoteResults(raceId, votes);
        });
    }

    renderVoteResults(raceId, votes) {
        Object.keys(votes).forEach(category => {
            const resultsContainer = document.getElementById(`results-${category}-${raceId}`);
            if (!resultsContainer) return;

            const categoryVotes = votes[category];
            const totalVotes = Object.values(categoryVotes).reduce((sum, count) => sum + count, 0);

            if (totalVotes === 0) {
                resultsContainer.innerHTML = '<small class="text-muted">No votes yet</small>';
                return;
            }

            const sortedResults = Object.entries(categoryVotes)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);

            resultsContainer.innerHTML = `
                <small class="text-muted d-block mb-2">${totalVotes} votes</small>
                ${sortedResults.map(([option, count], index) => {
                    const percentage = Math.round((count / totalVotes) * 100);
                    const badgeClass = index === 0 ? 'bg-primary' : index === 1 ? 'bg-secondary' : 'bg-light text-dark';
                    return `
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <small>${option}</small>
                            <span class="badge ${badgeClass}">${percentage}%</span>
                        </div>
                    `;
                }).join('')}
            `;
        });
    }

    // Helper methods
    formatTime(timestamp) {
        if (!timestamp) return 'Just now';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return date.toLocaleDateString();
    }

    // Public methods for global access
    async submitComment(raceId) {
        const input = document.getElementById(`comment-input-${raceId}`);
        if (!input || !input.value.trim()) return;

        try {
            await this.addComment(raceId, input.value);
            input.value = '';
            // Hide the form
            const form = document.getElementById(`comment-form-${raceId}`);
            if (form) {
                bootstrap.Collapse.getInstance(form)?.hide();
            }
        } catch (error) {
            console.error('Failed to submit comment:', error);
        }
    }

    async vote(raceId, category, option) {
        try {
            await this.submitVote(raceId, category, option);
            
            // Update UI to show selected option
            const buttons = document.querySelectorAll(`[data-category="${category}"]`);
            buttons.forEach(btn => btn.classList.remove('active'));
            
            const selectedButton = document.querySelector(`[data-category="${category}"][data-option="${option}"]`);
            if (selectedButton) {
                selectedButton.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to submit vote:', error);
        }
    }
}