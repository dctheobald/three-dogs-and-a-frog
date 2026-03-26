// --- Menu Logic ---
const trigger = document.getElementById('hamburgerTrigger');
const menu = document.getElementById('offcanvasMenu');
const closeBtn = document.getElementById('closeMenu');
const backdrop = document.getElementById('menuBackdrop');

function toggleMenu() {
    menu.classList.toggle('menu-open');
    backdrop.classList.toggle('backdrop-visible');
    document.body.style.overflow = menu.classList.contains('menu-open') ? 'hidden' : '';
}

if(trigger) trigger.addEventListener('click', toggleMenu);
if(closeBtn) closeBtn.addEventListener('click', toggleMenu);
if(backdrop) backdrop.addEventListener('click', toggleMenu);

// --- Cart Logic (Persisted via LocalStorage) ---
let cart = JSON.parse(localStorage.getItem('3dogsCart')) || [];

function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const countDisplay = document.getElementById('headerCartCount');
    if(countDisplay) countDisplay.innerText = totalItems;
}

function addToCart(id, name, price, image, buttonElement) {
    const existingItem = cart.find(item => item.id === id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id, name, price: parseFloat(price), image, quantity: 1 });
    }
    localStorage.setItem('3dogsCart', JSON.stringify(cart));
    updateCartCount();
    
    // Frog Visual Feedback
    const originalText = buttonElement.innerText;
    buttonElement.innerText = "Added! 🐸";
    setTimeout(() => { buttonElement.innerText = originalText; }, 1500);
}

document.querySelectorAll('.add-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        addToCart(card.dataset.id, card.dataset.name, card.dataset.price, card.dataset.image, e.target);
    });
});

updateCartCount();

// --- Cart Page Rendering Logic ---
function renderCartPage() {
    const cartContainer = document.getElementById('cart-contents');
    const cartTotalDisplay = document.getElementById('cart-total');
    
    if (!cartContainer || !cartTotalDisplay) return; // Only run on cart.html

    if (cart.length === 0) {
        cartContainer.innerHTML = '<p style="font-size: 1.2rem; margin-top: 2rem;">Your pack hasn\'t added any gear yet.</p>';
        cartTotalDisplay.innerText = '0.00';
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach((item, index) => {
        total += (item.price * item.quantity);
        html += `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <div>
                        <p class="cart-item-title">${item.name}</p>
                        <p class="cart-item-price">$${item.price.toFixed(2)}</p>
                    </div>
                    <div class="cart-actions">
                        <span>Qty: ${item.quantity}</span>
                        <button class="remove-btn" onclick="removeFromCart(${index})">Remove</button>
                    </div>
                </div>
            </div>
        `;
    });

    cartContainer.innerHTML = html;
    cartTotalDisplay.innerText = total.toFixed(2);
}

// Attach to the window so the inline onclick works
window.removeFromCart = function(index) {
    cart.splice(index, 1);
    localStorage.setItem('3dogsCart', JSON.stringify(cart));
    updateCartCount();
    renderCartPage();
};

renderCartPage(); // Run on load

// --- Frog Guide Chat Logic ---
const frogChatBtn = document.getElementById("frogChatBtn");
const frogChatWindow = document.getElementById("frogChatWindow");
const closeChatBtn = document.getElementById("closeChatBtn");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatMessages = document.getElementById("chatMessages");

// The Sherpa's Mock Wisdom
const frogResponses = [
    "Ribbit. A wise pack rests in the shade.",
    "Waterproof gear is essential. Trust me, I'm an amphibian.",
    "The trail is steep, but the Bulldogs can handle it.",
    "Always pack an extra bowl. The Bernedoodle drinks fast.",
    "A croak in the night means the camp is safe.",
    "Listen to the river; it knows the way to basecamp.",
    "Even the fluffiest Sheepadoodle needs a good harness.",
    "Ribbit. You have exceptional taste in outdoor gear."
];

if (frogChatBtn && frogChatWindow) {
    // Toggle the chat window open and closed
    frogChatBtn.addEventListener("click", () => {
        frogChatWindow.classList.toggle("active");
    });

    closeChatBtn.addEventListener("click", () => {
        // 1. Close the window
        frogChatWindow.classList.remove("active");
        
        // 2. Wait 300ms for the closing animation to finish, then clear the chat
        setTimeout(() => {
            chatMessages.innerHTML = '<div class="message frog-msg">Ribbit. Welcome to basecamp. How can I guide your pack today?</div>';
        }, 300);
    });

    // Handle sending a message
    const sendMessage = () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // 1. Render User Message
        const userMsgDiv = document.createElement("div");
        userMsgDiv.className = "message user-msg";
        userMsgDiv.textContent = text;
        chatMessages.appendChild(userMsgDiv);
        chatInput.value = "";
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom

        // 2. Simulate Frog Thinking & Replying (1-second delay)
        setTimeout(() => {
            const frogMsgDiv = document.createElement("div");
            frogMsgDiv.className = "message frog-msg";
            
            // Pick a random response from the array
            const randomResponse = frogResponses[Math.floor(Math.random() * frogResponses.length)];
            frogMsgDiv.textContent = randomResponse;
            
            chatMessages.appendChild(frogMsgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
        }, 1000);
    };

    sendChatBtn.addEventListener("click", sendMessage);
    
    // Allow pressing "Enter" to send
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
}

// --- Shop Filter Engine ---
const filterCheckboxes = document.querySelectorAll('.filter-cb');
const allProductCards = document.querySelectorAll('#shopProductGrid .product-card');

if (filterCheckboxes.length > 0 && allProductCards.length > 0) {
    filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            
            // Logic to handle the "All Gear" master checkbox
            if (cb.value === 'all' && cb.checked) {
                document.querySelectorAll('.category-cb').forEach(c => { if(c.value !== 'all') c.checked = false; });
            } else if (cb.classList.contains('category-cb') && cb.checked) {
                document.querySelector('.category-cb[value="all"]').checked = false;
            }

            // Figure out what filters the user currently has checked
            const activeCategories = Array.from(document.querySelectorAll('.category-cb:checked')).map(c => c.value);
            const activeSizes = Array.from(document.querySelectorAll('.size-cb:checked')).map(c => c.value);

            // Loop through every single product on the page
            allProductCards.forEach(card => {
                const cardCategory = card.dataset.category;
                const cardSize = card.dataset.size;

                // Check if the product matches the active filters
                const categoryMatch = activeCategories.includes('all') || activeCategories.length === 0 || activeCategories.includes(cardCategory);
                const sizeMatch = activeSizes.length === 0 || activeSizes.includes(cardSize);

                // Hide or show the product based on the match
                if (categoryMatch && sizeMatch) {
                    card.style.display = 'flex'; // our specific CSS uses flex for cards
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// --- Stripe Checkout Trigger ---
const checkoutBtn = document.getElementById('checkout-btn');

if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
        if (cart.length === 0) return;

        // Give the user visual feedback that it's loading
        checkoutBtn.innerText = "Processing Secure Checkout... 🐸";
        checkoutBtn.disabled = true;

        try {
            // Send the cart to our server
            const response = await fetch('/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart: cart })
            });

            const session = await response.json();

            // Redirect the user to the Stripe-hosted checkout page
            if (session.url) {
                window.location.href = session.url;
            } else {
                throw new Error("No session URL returned");
            }
        } catch (error) {
            console.error("Checkout failed:", error);
            checkoutBtn.innerText = "Checkout Failed - Try Again";
            checkoutBtn.disabled = false;
        }
    });
}
