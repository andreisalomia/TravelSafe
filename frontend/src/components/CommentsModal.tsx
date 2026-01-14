import { useState, useEffect } from 'react';

// --- Stiluri (neschimbate) ---
const styles = {
  overlay: {
    position: 'fixed' as 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '400px',
    maxWidth: '90%',
    maxHeight: '80vh',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as 'column',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    overflow: 'hidden'
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as 'auto',
    padding: '15px',
    backgroundColor: '#f8f9fa'
  },
  commentItem: {
    backgroundColor: '#fff',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '10px',
    marginBottom: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  }
};

interface Comment {
    id: number;
    user: string;
    content: string;
    created_at: string;
}

interface CommentsModalProps {
    eventId: number | null;
    onClose: () => void;
}

const CommentsModal = ({ eventId, onClose }: CommentsModalProps) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (eventId) fetchComments();
    }, [eventId]);

    const fetchComments = async () => {
        if (!eventId) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:5000/api/events/${eventId}/comments`);
            const data = await res.json();
            setComments(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- MODIFICAREA ESTE AICI ---
    const handleSend = async () => {
        if (!newComment.trim() || !eventId) return;

        // 1. Luăm token-ul salvat la login
        const token = localStorage.getItem('token'); 

        // 2. Dacă nu există token, anunțăm utilizatorul și oprim funcția
        if (!token) {
            alert("Trebuie să fii autentificat pentru a comenta.");
            return;
        }

        try {
            const res = await fetch(`http://localhost:5000/api/events/${eventId}/comments`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // 3. Trimitem token-ul la server
                }, 
                body: JSON.stringify({ content: newComment })
            });

            if (res.ok) {
                setNewComment('');
                fetchComments(); // Reîncarcă lista
            } else {
                // Dacă token-ul a expirat sau e invalid
                if (res.status === 401) {
                    alert("Sesiunea a expirat. Te rugăm să te autentifici din nou.");
                } else {
                    alert("Eroare la trimiterea comentariului.");
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    if (!eventId) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.modalContent}>
                {/* HEADER */}
                <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-white">
                    <h5 className="m-0">Discuție Incident #{eventId}</h5>
                    <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
                </div>
                
                {/* LISTA COMENTARII */}
                <div style={styles.scrollArea}>
                    {loading ? (
                        <div className="text-center p-3">Se încarcă...</div>
                    ) : (
                        <>
                            {comments.length === 0 ? (
                                <p className="text-muted text-center my-4">Fii primul care comentează!</p>
                            ) : (
                                comments.map(c => (
                                    <div key={c.id} style={styles.commentItem}>
                                        <div className="d-flex justify-content-between mb-1">
                                            <strong className="text-primary">{c.user}</strong>
                                            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </small>
                                        </div>
                                        <div className="text-dark" style={{ wordBreak: 'break-word' }}>
                                            {c.content}
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </div>

                {/* INPUT ZONA */}
                <div className="p-3 border-top bg-white">
                    <div className="input-group">
                        <input 
                            type="text" 
                            className="form-control"
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            placeholder="Adaugă detalii..."
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button className="btn btn-primary" onClick={handleSend}>
                            Trimite
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommentsModal;