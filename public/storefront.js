// ==========================================
// 🏕️ 3 DOGS AND A FROG - RETAIL STOREFRONT LIFE CYCLE
// ==========================================
console.log("🚀 STOREFRONT.JS LOADED - V16");

document.addEventListener('DOMContentLoaded', () => {
    // 🔐 Only wipe the cart if Stripe provided the cryptographic session_id
    const urlParams = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/success' && urlParams.has('session_id')) {
        localStorage.removeItem('frog_cart');
    }

    let cart = [];
    try {
        const storedCart = JSON.parse(localStorage.getItem('frog_cart'));
        cart = Array.isArray(storedCart) ? storedCart : [];
    } catch (e) {
        cart = [];
        localStorage.removeItem('frog_cart');
    }

    const filterCheckboxes = document.querySelectorAll('.filter-cb');
    const productCards = document.querySelectorAll('.product-card');
    updateCartUI();

    // ==========================================
    // 🛡️ INDESTRUCTIBLE MASTER CLICK LISTENER
    // ==========================================
    document.addEventListener('click', async (e) => {

        // 1. MOBILE HAMBURGER MENU & CLOSE BUTTON
        const menuToggle = e.target.closest('.bi-list, .navbar-toggler, #mobile-menu-btn, .hamburger-trigger, #hamburgerTrigger, #closeMenu, .close-menu');
        if (menuToggle) {
            e.preventDefault();
            const mobileMenu = document.getElementById('mobile-menu') || document.getElementById('offcanvasMenu') || document.querySelector('.offcanvas-menu');
            const backdrop = document.getElementById('menuBackdrop') || document.querySelector('.menu-backdrop');
            
            // Toggle the exact magic classes from your styles.css
            if (mobileMenu) mobileMenu.classList.toggle('menu-open');
            if (backdrop) backdrop.classList.toggle('backdrop-visible');
            return;
        }

        // 2. FROG CHAT TOGGLE & CLOSE BUTTON
        const frogToggle = e.target.closest('#frogChatBtn, .frog-chat-btn, #closeChatBtn');
        if (frogToggle) {
            e.preventDefault();
            const chatWindow = document.getElementById('frog-chat-window') || document.getElementById('frogChatWindow') || document.querySelector('.frog-chat-window');
            
            // Toggle the exact magic class from your styles.css
            if (chatWindow) chatWindow.classList.toggle('active');
            return;
        }

        // 3. SIGN UP DEMO BUTTON
        const btn = e.target.closest('button');
        if (btn && btn.textContent.trim() === 'Sign Up') {
            e.preventDefault();
            alert("Ribbit! 🐸 Thanks for signing up for the 3 Dogs & a Frog Demo Newsletter!");
            return;
        }

        // 4. ADD TO BAG BUTTON
        const addBtn = e.target.closest('.add-btn');
        if (addBtn) {
            e.preventDefault();
            const productElement = addBtn.closest('.product-card');
            if (!productElement) return;

            const rawName = productElement.dataset.name || productElement.querySelector('h3, h2, .product-title')?.textContent || "Unknown Item";
            
            let cleanPrice = 0;
            if (productElement.dataset.price) {
                cleanPrice = parseFloat(productElement.dataset.price);
            } else {
                const priceMatch = (productElement.textContent || "").match(/\$\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                cleanPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0.00;
            }

            const rawImage = productElement.dataset.image || productElement.querySelector('img')?.getAttribute('src') || "/images/placeholder.jpg";
            const generatedId = productElement.dataset.id || rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');

            const product = { id: generatedId, name: rawName, price: cleanPrice, image: rawImage, quantity: 1 };
            
            const existingIndex = cart.findIndex(item => item.id === product.id);
            if (existingIndex > -1) { cart[existingIndex].quantity += 1; } 
            else { cart.push(product); }

            saveCartState();
            updateCartUI();
            
            const initialText = addBtn.textContent;
            addBtn.textContent = "Added! 🎒";
            addBtn.disabled = true;
            setTimeout(() => { addBtn.textContent = initialText; addBtn.disabled = false; }, 1200);
            return;
        }

        // 5. CART PLUS BUTTON
        const plusBtn = e.target.closest('.qty-plus-btn');
        if (plusBtn) {
            e.preventDefault();
            const row = plusBtn.closest('.cart-item');
            if (row && row.dataset.index) {
                cart[row.dataset.index].quantity += 1;
                saveCartState(); updateCartUI();
            }
            return;
        }

        // 6. CART MINUS BUTTON
        const minusBtn = e.target.closest('.qty-minus-btn');
        if (minusBtn) {
            e.preventDefault();
            const row = minusBtn.closest('.cart-item');
            if (row && row.dataset.index) {
                const index = parseInt(row.dataset.index);
                if (cart[index].quantity > 1) { cart[index].quantity -= 1; } 
                else { cart.splice(index, 1); }
                saveCartState(); updateCartUI();
            }
            return;
        }

        // 7. STRIPE CHECKOUT BUTTON
        const checkoutBtn = e.target.closest('#checkout-btn, .btn-checkout, #checkout-button');
        if (checkoutBtn) {
            e.preventDefault();
            if (cart.length === 0) return;
            
            checkoutBtn.disabled = true;
            checkoutBtn.textContent = "Securing Trail Pass...";
            try {
                const response = await fetch('/create-checkout-session', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart: cart })
                });
                const session = await response.json();
                if (session.url) {
                    window.location.href = session.url;
                } else throw new Error("No URL returned");
            } catch (error) {
                alert("Ribbit. Could not connect to Stripe.");
                checkoutBtn.disabled = false;
                checkoutBtn.textContent = "Proceed to Checkout";
            }
            return;
        }
    }, true);

    // ==========================================
    // 🧠 AI AGENT INTERACTION LOOP (V14 - Persistent Memory)
    // ==========================================
    
    // 1. Manage the Session ID across page loads
    let sessionId = sessionStorage.getItem('frog_session_id');
    if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('frog_session_id', sessionId);
    }

    // 2. Manage the Chat History UI across page loads
    let chatHistory = JSON.parse(sessionStorage.getItem('frog_chat_history') || '[]');
    const chatMessagesContainer = document.getElementById('frog-chat-messages') || document.getElementById('chatMessages');

    if (chatMessagesContainer) {
        // Clear the default HTML hardcoded greeting and re-render history
        chatMessagesContainer.innerHTML = '';
        if (chatHistory.length === 0) {
            appendMessageBubble(chatMessagesContainer, 'frog', 'Ribbit. Welcome to basecamp. How can I guide your pack today?', false);
        } else {
            chatHistory.forEach(msg => appendMessageBubble(chatMessagesContainer, msg.sender, msg.text, false));
        }
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    const chatForm = document.getElementById('frog-chat-form') || document.querySelector('form.chat-input-area');
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const chatInput = document.getElementById('frog-chat-input') || document.getElementById('chatInput');
            if (!chatInput || !chatMessagesContainer) return;

            const userMessage = chatInput.value.trim();
            if (!userMessage) return;

            // Render and instantly save user message
            appendMessageBubble(chatMessagesContainer, 'user', userMessage, true);
            chatInput.value = '';
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

            // Show pulsing typing indicator (Do not save this to history)
            const typingSvg = `<svg width="24" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="12" r="3" fill="#166534"><animate id="s0" attributeName="r" begin="0;s2.end-0.5s" calcMode="spline" dur="0.75s" keySplines=".2 1 .2 1;.2 1 .2 1" values="3;0;3"/></circle><circle cx="12" cy="12" r="3" fill="#166534"><animate id="s1" attributeName="r" begin="s0.begin+0.25s" calcMode="spline" dur="0.75s" keySplines=".2 1 .2 1;.2 1 .2 1" values="3;0;3"/></circle><circle cx="20" cy="12" r="3" fill="#166534"><animate id="s2" attributeName="r" begin="s1.begin+0.25s" calcMode="spline" dur="0.75s" keySplines=".2 1 .2 1;.2 1 .2 1" values="3;0;3"/></circle></svg>`;
            const typingIndicator = appendMessageBubble(chatMessagesContainer, 'frog', typingSvg, false);
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

            try {
                const response = await fetch('/api/agent', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId }, 
                    body: JSON.stringify({ message: userMessage })
                });

                if (!response.ok) throw new Error(`Status: ${response.status}`);
                const data = await response.json();
                
                // Format response, update the UI, and THEN save the final text to history
                const formattedReply = data.reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                typingIndicator.innerHTML = formattedReply;
                saveToHistory('frog', formattedReply);

                // Execute background Cart UI tasks silently
                if (data.action && data.action.type === 'ADD_TO_CART') {
                    const p = data.action.product;
                    const existingIndex = cart.findIndex(item => item.id === p.id);
                    if (existingIndex > -1) { cart[existingIndex].quantity += 1; } 
                    else { cart.push(p); }
                    saveCartState(); updateCartUI();
                }
                if (data.action && data.action.type === 'CHECKOUT' && data.action.url) {
                    const linkHtml = `<a href="${data.action.url}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;background:#059669;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:700;">🐸 Complete secure checkout →</a>`;
                    appendMessageBubble(chatMessagesContainer, 'frog', linkHtml, false);
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                }
            } catch (error) {
                const errorMsg = "Ribbit... The radio signal is weak. Try again.";
                typingIndicator.innerHTML = errorMsg;
                saveToHistory('frog', errorMsg);
            }
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        });
    }

    // Helper to store messages in the browser's session storage
    function saveToHistory(sender, text) {
        chatHistory.push({ sender, text });
        sessionStorage.setItem('frog_chat_history', JSON.stringify(chatHistory));
    }

    // Helper to draw bubbles on the screen
    function appendMessageBubble(container, sender, text, save = true) {
        if (!container) return document.createElement('div');
        const bubble = document.createElement('div');
        bubble.style.padding = '10px 14px'; bubble.style.margin = '8px 0'; bubble.style.borderRadius = '12px';
        bubble.style.maxWidth = '80%'; bubble.style.fontSize = '14px'; bubble.style.lineHeight = '1.4';
        
        if (sender === 'user') {
            bubble.style.backgroundColor = '#e2e8f0'; bubble.style.color = '#1e293b';
            bubble.style.marginLeft = 'auto'; bubble.style.borderBottomRightRadius = '0px';
        } else {
            bubble.style.backgroundColor = '#dcfce7'; bubble.style.color = '#166534';
            bubble.style.marginRight = 'auto'; bubble.style.borderBottomLeftRadius = '0px';
        }
        
        bubble.innerHTML = text; 
        container.appendChild(bubble); 
        
        // Only save to storage if requested (avoids saving the pulsing SVG dots)
        if (save) saveToHistory(sender, text);
        return bubble;
    }

    // ==========================================
    // 🛒 E-COMMERCE CART UI RENDERER
    // ==========================================
    function saveCartState() { localStorage.setItem('frog_cart', JSON.stringify(cart)); }

    function updateCartUI() {
        const cartCountBadge = document.getElementById('headerCartCount') || document.getElementById('cart-count-badge') || document.querySelector('.cart-count');
        if (cartCountBadge) {
            const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCountBadge.textContent = totalCount;
            cartCountBadge.style.display = totalCount > 0 ? 'inline-block' : 'none';
        }
        renderCartPageItems();
    }

    function renderCartPageItems() {
        const cartPageContainer = document.getElementById('cart-items-container');
        const cartTotalContainer = document.getElementById('cart-total-amount') || document.getElementById('cart-total') || document.querySelector('.cart-total, .order-total, .total-price');
        
        if (!cartPageContainer) return;
        const checkoutBtn = document.getElementById('checkout-btn') || document.getElementById('checkout-button') || document.querySelector('.btn-checkout');

        if (cart.length === 0) {
            cartPageContainer.innerHTML = `<div style="text-align: center; padding: 3rem 0; color: #666;"><p>Your gear bag is currently empty.</p><a href="/shop" style="display: inline-block; background: #059669; color: white; padding: 0.5rem 1.5rem; text-decoration: none; border-radius: 4px;">Browse Outdoor Gear</a></div>`;
            if (cartTotalContainer) cartTotalContainer.textContent = "0.00";
            if (checkoutBtn) checkoutBtn.style.display = 'none';
            return;
        }

        if (checkoutBtn) checkoutBtn.style.display = 'block';
        let htmlAccumulator = ''; let orderTotal = 0;

        cart.forEach((item, index) => {
            const safePrice = parseFloat(item.price) || 0; 
            const itemTotal = safePrice * item.quantity;
            orderTotal += itemTotal;

            htmlAccumulator += `
                <div class="cart-item" data-index="${index}" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; padding: 1rem 0;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <img src="${item.image}" alt="${item.name}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;">
                        <div><h3 style="margin: 0 0 4px 0; font-size: 1rem; color: #333;">${item.name}</h3><p style="margin: 0; font-size: 0.85rem; color: #666;">$${safePrice.toFixed(2)} each</p></div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1.5rem;">
                        <div style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                            <button class="qty-minus-btn" style="padding: 4px 12px; background: #f9f9f9; border: none; cursor: pointer; font-weight: bold;">-</button>
                            <span style="padding: 4px 12px; font-size: 0.9rem;">${item.quantity}</span>
                            <button class="qty-plus-btn" style="padding: 4px 12px; background: #f9f9f9; border: none; border-left: 1px solid #ccc; cursor: pointer; font-weight: bold;">+</button>
                        </div>
                        <strong style="min-width: 70px; text-align: right; color: #111;">$${itemTotal.toFixed(2)}</strong>
                    </div>
                </div>`;
        });
        cartPageContainer.innerHTML = htmlAccumulator;
        if (cartTotalContainer) cartTotalContainer.textContent = orderTotal.toFixed(2);
    }

    // ==========================================
    // 🏷️ FILTERING LOGIC
    // ==========================================
    if (filterCheckboxes.length > 0 && productCards.length > 0) {
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.value === 'all' && e.target.checked) {
                    document.querySelectorAll('.category-cb:not([value="all"])').forEach(cb => cb.checked = false);
                } else if (e.target.classList.contains('category-cb') && e.target.checked) {
                    const allGearCb = document.querySelector('.category-cb[value="all"]');
                    if (allGearCb) allGearCb.checked = false;
                }
                const activeCategories = Array.from(document.querySelectorAll('.category-cb:checked')).map(cb => cb.value);
                const activeSizes = Array.from(document.querySelectorAll('.size-cb:checked')).map(cb => cb.value);
                const showAllCategories = activeCategories.length === 0 || activeCategories.includes('all');
                const showAllSizes = activeSizes.length === 0;

                productCards.forEach(card => {
                    const cardCategory = card.dataset.category; const cardSize = card.dataset.size; 
                    if ((showAllCategories || activeCategories.includes(cardCategory)) && (showAllSizes || !cardSize || activeSizes.includes(cardSize))) {
                        card.style.display = 'block';
                    } else { card.style.display = 'none'; }
                });
            });
        });
    }
});
