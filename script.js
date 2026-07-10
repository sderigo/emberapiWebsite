import PORTFOLIO_DATA from "./data/portfolio.json" with { type: "json" };

const REFRESH_INTERVAL_MS = 90_000;
const THUMBNAIL_SLIDE_DURATION_MS = 440;
const THUMBNAIL_SWIPE_THRESHOLD_PX = 40;
const ROPROXY_ENDPOINTS = {
  universeByPlace: "https://apis.roproxy.com/universes/v1/places",
  games: "https://games.roproxy.com/v1/games",
  icons: "https://thumbnails.roproxy.com/v1/games/icons",
  thumbnails: "https://thumbnails.roproxy.com/v1/games/multiget/thumbnails"
};

const cardTemplate = document.querySelector("#gameCardTemplate");
const gamesGrid = document.querySelector("#gamesGrid");
const gamesExpander = document.querySelector("#gamesExpander");
const gamesToggle = document.querySelector("#gamesToggle");
const gamesToggleCount = document.querySelector("#gamesToggleCount");
const gamesToggleLabel = document.querySelector("#gamesToggleLabel");
const gamesToggleDetail = document.querySelector("#gamesToggleDetail");
const errorBanner = document.querySelector("#errorBanner");
const syncState = document.querySelector("#syncState");
const refreshState = document.querySelector("#refreshState");
const heroDescription = document.querySelector("#heroDescription");
const totalCcu = document.querySelector("#totalCcu");
const totalVisits = document.querySelector("#totalVisits");
const gameCount = document.querySelector("#gameCount");
const lastRefresh = document.querySelector("#lastRefresh");
const gameModalBackdrop = document.querySelector("#gameModalBackdrop");
const gameModal = document.querySelector("#gameModal");
const gameModalShell = document.querySelector(".game-modal-shell");
const gameModalPanel = document.querySelector(".game-modal-panel");
const modalCloseButton = document.querySelector("#modalCloseButton");
const modalGameImage = document.querySelector("#modalGameImage");
const modalGameYear = document.querySelector("#modalGameYear");
const modalGameTitle = document.querySelector("#modalGameTitle");
const modalGameDescription = document.querySelector("#modalGameDescription");
const modalDescriptionToggle = document.querySelector("#modalDescriptionToggle");
const modalGameCcu = document.querySelector("#modalGameCcu");
const modalGameVisits = document.querySelector("#modalGameVisits");
const modalGameFavorites = document.querySelector("#modalGameFavorites");
const modalGameOwner = document.querySelector("#modalGameOwner");
const modalGameTags = document.querySelector("#modalGameTags");
const modalGameLink = document.querySelector("#modalGameLink");
const modalCreatorLink = document.querySelector("#modalCreatorLink");
const modalCopyLinkButton = document.querySelector("#modalCopyLinkButton");
const modalCopyLinkLabel = modalCopyLinkButton.querySelector(".button-label");
const pageShell = document.querySelector("#pageShell");
const heroStage = document.querySelector("#heroStage");
const heroDeck = document.querySelector("#heroDeck");
const heroGameButton = document.querySelector("#heroGameButton");
const heroSpotlightImage = document.querySelector("#heroSpotlightImage");
const heroSpotlightStatus = document.querySelector("#heroSpotlightStatus");
const heroSpotlightYear = document.querySelector("#heroSpotlightYear");
const heroSpotlightTitle = document.querySelector("#heroSpotlightTitle");
const heroSpotlightOwner = document.querySelector("#heroSpotlightOwner");
const heroSpotlightCcu = document.querySelector("#heroSpotlightCcu");
const heroSpotlightVisits = document.querySelector("#heroSpotlightVisits");
const heroDeckImageSecond = document.querySelector("#heroDeckImageSecond");
const heroDeckImageThird = document.querySelector("#heroDeckImageThird");

const reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointerMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
const compactLayoutMediaQuery = window.matchMedia(
  "(max-width: 640px), (max-width: 940px) and (max-height: 560px) and (orientation: landscape) and (pointer: coarse)"
);
const mobileModalMediaQuery = window.matchMedia(
  "(max-width: 800px), (max-width: 940px) and (max-height: 560px) and (orientation: landscape) and (pointer: coarse)"
);

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const fullNumberFormatter = new Intl.NumberFormat("en-US");

let portfolioData = null;
let overviewState = {
  combinedCcu: 0,
  combinedVisits: 0,
  gameCount: 0
};
let hasRenderedGames = false;
let areAllGamesVisible = false;
const gameRevealAnimations = new WeakMap();
let currentGamesByUniverseId = new Map();
let activeModalUniverseId = null;
let modalCloseTimeoutId = null;
let modalDescriptionResizeFrameId = null;
let copyLinkResetTimeoutId = null;
let modalTriggerElement = null;
let lockedPageScrollY = 0;
let isPageScrollLocked = false;
let usesFixedPageScrollLock = false;
let heroFeaturedGame = null;
let isRefreshing = false;
let preloadedThumbnailPromises = new Map();
let thumbnailTrackStates = new WeakMap();

const clonePortfolioData = () => JSON.parse(JSON.stringify(PORTFOLIO_DATA));

const setRefreshMessage = (message, isError = false) => {
  refreshState.textContent = message;
  syncState.classList.toggle("hidden", !isError);
};

const showError = (message) => {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
};

const hideError = () => {
  errorBanner.classList.add("hidden");
  errorBanner.textContent = "";
};

const setModalCopyLinkLabel = (label) => {
  modalCopyLinkLabel.textContent = label;
};

const setModalDescriptionExpanded = (isExpanded) => {
  modalGameDescription.classList.toggle("is-expanded", isExpanded);
  modalDescriptionToggle.setAttribute("aria-expanded", String(isExpanded));
  modalDescriptionToggle.querySelector("span").textContent = isExpanded
    ? "Show less"
    : "Read full description";
};

const syncModalDescriptionToggle = () => {
  if (!gameModal.classList.contains("is-visible") || !mobileModalMediaQuery.matches) {
    modalDescriptionToggle.hidden = true;
    return;
  }

  if (modalDescriptionToggle.getAttribute("aria-expanded") === "true") {
    modalDescriptionToggle.hidden = false;
    return;
  }

  modalDescriptionToggle.hidden = false;
  modalDescriptionToggle.hidden = modalGameDescription.scrollHeight <= modalGameDescription.clientHeight + 1;
};

const scheduleModalDescriptionSync = () => {
  if (!gameModal.classList.contains("is-visible") || modalDescriptionResizeFrameId) {
    return;
  }

  modalDescriptionResizeFrameId = window.requestAnimationFrame(() => {
    modalDescriptionResizeFrameId = null;
    syncModalDescriptionToggle();
  });
};

const lockPageScroll = () => {
  if (isPageScrollLocked) {
    return;
  }

  lockedPageScrollY = window.scrollY;
  usesFixedPageScrollLock = mobileModalMediaQuery.matches;
  isPageScrollLocked = true;

  if (usesFixedPageScrollLock) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedPageScrollY}px`;
    document.body.style.right = "0";
    document.body.style.left = "0";
    document.body.style.width = "100%";
  }

  document.body.style.overflow = "hidden";
};

const unlockPageScroll = () => {
  if (!isPageScrollLocked) {
    return;
  }

  document.body.style.overflow = "";

  if (usesFixedPageScrollLock) {
    document.documentElement.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.right = "";
    document.body.style.left = "";
    document.body.style.width = "";

    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, lockedPageScrollY);
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
  }

  isPageScrollLocked = false;
  usesFixedPageScrollLock = false;
};

const formatCompactNumber = (value) => compactNumberFormatter.format(value ?? 0);
const formatFullNumber = (value) => fullNumberFormatter.format(value ?? 0);

const relativeRefreshLabel = (date) => {
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (now.toDateString() === date.toDateString()) {
    return `Today at ${time}`;
  }

  const shortDate = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${shortDate} at ${time}`;
};

const animateCounter = (element, fromValue, toValue, formatter) => {
  if (reducedMotionMediaQuery.matches) {
    element.textContent = formatter(toValue);
    return;
  }

  const duration = 900;
  const startTime = performance.now();

  const tick = (currentTime) => {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(fromValue + (toValue - fromValue) * eased);

    element.textContent = formatter(currentValue);

    if (progress < 1) {
      window.requestAnimationFrame(tick);
    }
  };

  window.requestAnimationFrame(tick);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
};

const getUniverseId = async (game) => {
  if (game.universeId) {
    return game.universeId;
  }

  const payload = await fetchJson(`${ROPROXY_ENDPOINTS.universeByPlace}/${game.placeId}/universe`);
  return payload.universeId;
};

const getUniverseIds = async (games) => Promise.all(games.map((game) => getUniverseId(game)));

const getGameDetails = async (universeIds) => {
  const url = `${ROPROXY_ENDPOINTS.games}?universeIds=${universeIds.join(",")}`;
  const payload = await fetchJson(url);
  return payload.data ?? [];
};

const getGameIcons = async (universeIds) => {
  const url = `${ROPROXY_ENDPOINTS.icons}?universeIds=${universeIds.join(",")}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`;
  const payload = await fetchJson(url);
  return payload.data ?? [];
};

const getGameThumbnails = async (universeIds) => {
  const url = `${ROPROXY_ENDPOINTS.thumbnails}?universeIds=${universeIds.join(",")}&countPerUniverse=5&defaults=true&size=768x432&format=Png&isCircular=false`;
  const payload = await fetchJson(url);
  return payload.data ?? [];
};

const mergePortfolioData = (games, liveGameDetails, liveIcons, liveThumbnails, universeIds) => {
  const detailsByUniverse = new Map(liveGameDetails.map((entry) => [entry.id, entry]));
  const iconsByUniverse = new Map(liveIcons.map((entry) => [entry.targetId, entry.imageUrl]));
  const thumbnailsByUniverse = new Map(
    liveThumbnails.map((entry) => [
      entry.universeId,
      (entry.thumbnails ?? []).map((thumbnail) => thumbnail.imageUrl).filter(Boolean)
    ])
  );

  return games
    .map((game, index) => {
      const universeId = universeIds[index];
      const details = detailsByUniverse.get(universeId) ?? {};
      const iconUrl = iconsByUniverse.get(universeId) ?? game.iconUrl ?? "";
      const imageUrls = thumbnailsByUniverse.get(universeId) ?? [];

      return {
        ...game,
        universeId,
        iconUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : [iconUrl].filter(Boolean),
        name: details.name ?? game.title ?? "Untitled Game",
        description: details.description ?? "",
        visits: details.visits ?? 0,
        playing: details.playing ?? 0,
        favorites: details.favoritedCount ?? 0,
        creatorName: details.creator?.name ?? game.creatorName ?? "Unknown Creator",
        creatorType: details.creator?.type ?? "Group",
        creatorId: details.creator?.id ?? null,
        genre: details.genre_l1 || details.genre || "Roblox",
        maxPlayers: details.maxPlayers ?? null,
        gameUrl: game.externalUrl ?? `https://www.roblox.com/games/${game.placeId}`
      };
    })
    .sort((left, right) => right.playing - left.playing);
};

const updateHeroDeck = (games) => {
  const [featuredGame, secondGame, thirdGame] = games;

  if (!featuredGame) {
    return;
  }

  heroFeaturedGame = featuredGame;
  heroSpotlightImage.src = featuredGame.imageUrls[0] ?? "";
  heroSpotlightImage.alt = `${featuredGame.name} gameplay thumbnail`;
  heroSpotlightStatus.textContent = featuredGame.status ?? "Live game";
  heroSpotlightYear.textContent = featuredGame.year ?? "Live";
  heroSpotlightTitle.textContent = featuredGame.name;
  heroSpotlightOwner.textContent = featuredGame.creatorName;
  heroSpotlightCcu.textContent = formatCompactNumber(featuredGame.playing);
  heroSpotlightVisits.textContent = formatCompactNumber(featuredGame.visits);
  heroGameButton.disabled = false;
  heroGameButton.setAttribute("aria-label", `Open details for ${featuredGame.name}`);

  heroDeckImageSecond.src = secondGame?.imageUrls[0] ?? featuredGame.imageUrls[1] ?? "";
  heroDeckImageThird.src = thirdGame?.imageUrls[0] ?? featuredGame.imageUrls[2] ?? "";
};

const updateOverview = (profile, games) => {
  const combinedCcu = games.reduce((sum, game) => sum + (game.playing ?? 0), 0);
  const combinedVisits = games.reduce((sum, game) => sum + (game.visits ?? 0), 0);
  const now = new Date();
  const syncTime = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  document.title = `${profile.name} | Roblox Portfolio`;
  heroDescription.textContent = profile.description;
  animateCounter(totalCcu, overviewState.combinedCcu, combinedCcu, formatCompactNumber);
  animateCounter(totalVisits, overviewState.combinedVisits, combinedVisits, formatCompactNumber);
  animateCounter(gameCount, overviewState.gameCount, games.length, (value) => String(value));
  lastRefresh.textContent = relativeRefreshLabel(now);
  setRefreshMessage(`Live stats synced at ${syncTime}`);
  updateHeroDeck(games);
  overviewState = {
    combinedCcu,
    combinedVisits,
    gameCount: games.length
  };
};

const buildTagItems = (game) => Array.from(
  new Set([game.status, game.genre, ...(game.tags ?? [])].filter(Boolean))
);

const renderTagItems = (container, game) => {
  container.innerHTML = "";

  buildTagItems(game).forEach((tag) => {
    const tagNode = document.createElement("span");
    tagNode.className = "tag-item";
    tagNode.textContent = tag;
    container.appendChild(tagNode);
  });
};

const renderGameTags = (container, game) => {
  container.innerHTML = "";

  [...(game.tags ?? [])]
    .filter(Boolean)
    .slice(0, 4)
    .forEach((tag) => {
      const tagNode = document.createElement("span");
      tagNode.className = "game-tag";
      tagNode.textContent = tag;
      container.appendChild(tagNode);
    });
};

const getCreatorUrl = (game) => {
  if (!game.creatorId) {
    return game.gameUrl;
  }

  if (game.creatorType === "User") {
    return `https://www.roblox.com/users/${game.creatorId}/profile`;
  }

  return `https://www.roblox.com/communities/${game.creatorId}`;
};

const preloadThumbnailAsync = async (url) => {
  if (!url) {
    return;
  }

  if (preloadedThumbnailPromises.has(url)) {
    await preloadedThumbnailPromises.get(url);
    return;
  }

  const promise = new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve();
    };

    image.onerror = () => {
      resolve();
    };

    image.src = url;

    if (image.complete) {
      resolve();
    }
  });

  preloadedThumbnailPromises.set(url, promise);
  await promise;
};

const normalizeThumbnailFrames = (frames) => {
  const uniqueFrames = [];
  const seenFrames = new Set();

  frames.forEach((frame) => {
    if (!frame || seenFrames.has(frame)) {
      return;
    }

    seenFrames.add(frame);
    uniqueFrames.push(frame);
  });

  return uniqueFrames;
};

const openGameModal = (game, triggerElement = null) => {
  const wasOpen = gameModal.classList.contains("is-visible");
  const isDifferentGame = activeModalUniverseId !== game.universeId;

  if (modalCloseTimeoutId) {
    window.clearTimeout(modalCloseTimeoutId);
    modalCloseTimeoutId = null;
  }

  if (copyLinkResetTimeoutId) {
    window.clearTimeout(copyLinkResetTimeoutId);
    copyLinkResetTimeoutId = null;
  }

  if (!wasOpen) {
    modalTriggerElement = triggerElement ?? document.activeElement;
  }

  const description = game.description || "No public description is available for this experience right now.";

  activeModalUniverseId = game.universeId;
  modalGameImage.src = game.iconUrl || game.imageUrls[0] || "";
  modalGameImage.alt = `${game.name} icon`;
  modalGameYear.textContent = game.year ?? "Live";
  modalGameTitle.textContent = game.name;
  modalGameDescription.textContent = description;
  modalDescriptionToggle.hidden = true;

  if (!wasOpen || isDifferentGame) {
    setModalDescriptionExpanded(false);
  }
  modalGameCcu.textContent = formatCompactNumber(game.playing);
  modalGameVisits.textContent = formatCompactNumber(game.visits);
  modalGameFavorites.textContent = formatCompactNumber(game.favorites);
  modalGameCcu.title = formatFullNumber(game.playing);
  modalGameVisits.title = formatFullNumber(game.visits);
  modalGameFavorites.title = formatFullNumber(game.favorites);
  modalGameOwner.textContent = game.creatorName;
  modalGameOwner.href = getCreatorUrl(game);
  modalGameLink.href = game.gameUrl;
  modalCreatorLink.href = getCreatorUrl(game);
  gameModalPanel.dataset.accent = game.accent ?? "ember";
  setModalCopyLinkLabel("Copy game link");
  renderTagItems(modalGameTags, game);
  gameModal.inert = false;
  gameModal.classList.add("is-visible");
  gameModalBackdrop.classList.add("is-visible");
  gameModal.setAttribute("aria-hidden", "false");
  pageShell.inert = true;

  if (!wasOpen) {
    lockPageScroll();
  }

  window.requestAnimationFrame(() => {
    if (!wasOpen || isDifferentGame) {
      gameModalShell.scrollTop = 0;
    }

    syncModalDescriptionToggle();
  });

  if (!wasOpen) {
    window.requestAnimationFrame(() => modalCloseButton.focus());
  }
};

const closeGameModal = () => {
  if (!gameModal.classList.contains("is-visible")) {
    return;
  }

  activeModalUniverseId = null;
  gameModal.classList.remove("is-visible");
  gameModalBackdrop.classList.remove("is-visible");
  pageShell.inert = false;

  if (modalDescriptionResizeFrameId) {
    window.cancelAnimationFrame(modalDescriptionResizeFrameId);
    modalDescriptionResizeFrameId = null;
  }

  modalDescriptionToggle.hidden = true;

  const focusTarget = modalTriggerElement;
  modalTriggerElement = null;
  const canRestoreTriggerFocus = focusTarget?.isConnected
    && !focusTarget.closest("[inert]")
    && focusTarget.getClientRects().length > 0;
  const focusDestination = canRestoreTriggerFocus ? focusTarget : gamesToggle;

  if (focusDestination?.isConnected && focusDestination.getClientRects().length > 0) {
    focusDestination.focus({ preventScroll: true });
  }

  gameModal.setAttribute("aria-hidden", "true");
  gameModal.inert = true;

  modalCloseTimeoutId = window.setTimeout(() => {
    unlockPageScroll();
    modalCloseTimeoutId = null;
  }, 260);
};

const getThumbnailTrackState = (track) => thumbnailTrackStates.get(track);

const resetThumbnailGestureState = (track) => {
  const state = getThumbnailTrackState(track);

  if (!state) {
    return;
  }

  state.pointerId = null;
  state.pointerStartX = 0;
  state.pointerStartY = 0;
  state.pointerDeltaX = 0;
  state.pointerDeltaY = 0;
  state.isPointerDown = false;
};

const slideThumbnailTrack = async (track, direction) => {
  const state = getThumbnailTrackState(track);

  if (!state || state.frames.length < 2 || state.isAnimating) {
    return;
  }

  state.isAnimating = true;
  state.animationToken += 1;

  const token = state.animationToken;
  const { frames } = state;
  const currentIndex = state.currentIndex;
  const nextIndex = (currentIndex + direction + frames.length) % frames.length;
  const currentImage = track.querySelector(".game-media-current");
  const nextImage = track.querySelector(".game-media-next");
  const directionClass = direction > 0 ? "is-sliding-forward" : "is-sliding-backward";

  await preloadThumbnailAsync(frames[nextIndex]);

  if (token !== state.animationToken) {
    state.isAnimating = false;
    return;
  }

  track.classList.add("is-resetting");
  track.classList.toggle("is-prepared-backward", direction < 0);
  track.classList.remove("is-sliding-forward", "is-sliding-backward");

  nextImage.src = frames[nextIndex];
  nextImage.alt = "";
  nextImage.style.zIndex = "1";
  currentImage.style.zIndex = "0";

  window.requestAnimationFrame(() => {
    if (token !== state.animationToken) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (token !== state.animationToken) {
        return;
      }

      track.classList.remove("is-resetting");
      track.classList.add(directionClass);
    });
  });

  window.setTimeout(() => {
    if (token !== state.animationToken) {
      return;
    }

    track.classList.add("is-resetting");
    currentImage.src = frames[nextIndex];
    nextImage.removeAttribute("src");
    track.classList.remove("is-sliding-forward", "is-sliding-backward");
    track.classList.remove("is-prepared-backward");
    nextImage.style.zIndex = "0";
    currentImage.style.zIndex = "1";

    window.requestAnimationFrame(() => {
      if (token !== state.animationToken) {
        return;
      }

      track.classList.remove("is-resetting");
      state.currentIndex = nextIndex;
      state.isAnimating = false;
    });
  }, reducedMotionMediaQuery.matches ? 0 : THUMBNAIL_SLIDE_DURATION_MS);
};

const attachThumbnailSwipeHandlers = (mediaWrap, mediaTrack) => {
  mediaWrap.addEventListener("pointerdown", (event) => {
    const state = getThumbnailTrackState(mediaTrack);

    if (!state || state.frames.length < 2) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (event.target.closest(".game-media-control")) {
      return;
    }

    state.pointerId = event.pointerId;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.pointerDeltaX = 0;
    state.pointerDeltaY = 0;
    state.isPointerDown = true;

    if (typeof mediaWrap.setPointerCapture === "function") {
      mediaWrap.setPointerCapture(event.pointerId);
    }
  });

  mediaWrap.addEventListener("pointermove", (event) => {
    const state = getThumbnailTrackState(mediaTrack);

    if (!state || !state.isPointerDown || state.pointerId !== event.pointerId) {
      return;
    }

    state.pointerDeltaX = event.clientX - state.pointerStartX;
    state.pointerDeltaY = event.clientY - state.pointerStartY;

    if (Math.abs(state.pointerDeltaX) > Math.abs(state.pointerDeltaY) && Math.abs(state.pointerDeltaX) > 10) {
      event.preventDefault();
    }
  });

  const finishGesture = (event) => {
    const state = getThumbnailTrackState(mediaTrack);

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = state.pointerDeltaX;
    const deltaY = state.pointerDeltaY;
    const shouldSwipe = Math.abs(deltaX) >= THUMBNAIL_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);

    if (typeof mediaWrap.releasePointerCapture === "function" && mediaWrap.hasPointerCapture(event.pointerId)) {
      mediaWrap.releasePointerCapture(event.pointerId);
    }

    resetThumbnailGestureState(mediaTrack);

    if (!shouldSwipe) {
      return;
    }

    slideThumbnailTrack(mediaTrack, deltaX < 0 ? 1 : -1);
  };

  mediaWrap.addEventListener("pointerup", finishGesture);
  mediaWrap.addEventListener("pointercancel", (event) => {
    const state = getThumbnailTrackState(mediaTrack);

    if (state?.pointerId !== event.pointerId) {
      return;
    }

    if (typeof mediaWrap.releasePointerCapture === "function" && mediaWrap.hasPointerCapture(event.pointerId)) {
      mediaWrap.releasePointerCapture(event.pointerId);
    }

    resetThumbnailGestureState(mediaTrack);
  });
};

const renderLoadingCards = (count) => {
  gamesGrid.innerHTML = "";
  gamesGrid.setAttribute("aria-busy", "true");
  gamesExpander.classList.add("hidden");
  areAllGamesVisible = false;

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index += 1) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);

    node.classList.add("loading");
    node.setAttribute("aria-hidden", "true");
    node.inert = true;
    node.querySelector(".game-rank").textContent = String(index + 1).padStart(2, "0");
    node.querySelector(".game-overlay-badge").textContent = "Loading";
    node.querySelector(".game-overlay-year").textContent = "--";
    node.querySelector(".game-overlay-title").textContent = "Loading lineup";
    node.querySelector(".game-status").textContent = "Connecting";
    node.querySelector(".game-year").textContent = "--";
    node.querySelector(".game-owner").textContent = "Live Roblox data";
    node.querySelector(".game-heading").textContent = "Loading lineup";
    node.querySelector(".game-genre").textContent = "Fetching game details";
    node.querySelector(".game-link span").textContent = "Play on Roblox";
    node.querySelector(".game-ccu").textContent = "--";
    node.querySelector(".game-visits").textContent = "--";
    node.querySelector(".game-favorites").textContent = "--";
    node.querySelector(".game-media-controls").hidden = true;

    fragment.appendChild(node);
  }

  gamesGrid.appendChild(fragment);
};

const revealGameCard = (node, revealIndex) => {
  if (reducedMotionMediaQuery.matches || typeof node.animate !== "function") {
    return;
  }

  gameRevealAnimations.get(node)?.cancel();

  const cardHeight = node.getBoundingClientRect().height;
  node.style.overflow = "hidden";

  const animation = node.animate(
    [
      { height: "0px", opacity: 0, transform: "translateY(28px)" },
      { height: `${cardHeight}px`, opacity: 1, transform: "translateY(0)" }
    ],
    {
      duration: 520,
      delay: revealIndex * 130,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "both"
    }
  );

  gameRevealAnimations.set(node, animation);
  animation.finished.then(() => {
    if (gameRevealAnimations.get(node) !== animation) {
      return;
    }

    gameRevealAnimations.delete(node);
    node.style.removeProperty("overflow");
    animation.cancel();
  }, () => {});
};

const updateGamesVisibility = ({ animate = false } = {}) => {
  const cards = Array.from(gamesGrid.querySelectorAll(".game-card:not(.loading)"));
  const visibleGameCount = compactLayoutMediaQuery.matches ? 2 : 4;
  const extraGameCount = Math.max(0, cards.length - visibleGameCount);

  cards.forEach((node, index) => {
    const shouldHide = !areAllGamesVisible && index >= visibleGameCount;
    const wasHidden = node.hidden;

    if (shouldHide) {
      gameRevealAnimations.get(node)?.cancel();
      gameRevealAnimations.delete(node);
      node.style.removeProperty("overflow");
    }

    node.hidden = shouldHide;
    node.inert = shouldHide;

    if (animate && wasHidden && !shouldHide) {
      revealGameCard(node, index - visibleGameCount);
    }
  });

  gamesExpander.classList.toggle("hidden", extraGameCount === 0);
  gamesToggle.setAttribute("aria-expanded", String(areAllGamesVisible));
  gamesToggle.setAttribute(
    "aria-label",
    areAllGamesVisible ? "Show fewer games" : "View all games"
  );
  gamesToggleCount.textContent = areAllGamesVisible ? "LESS" : "MORE";
  gamesToggleLabel.textContent = areAllGamesVisible ? "Show fewer games" : "View all games";
  gamesToggleDetail.textContent = areAllGamesVisible
    ? "Return to the highlights"
    : "Open the complete lineup";
};

gamesToggle.addEventListener("click", () => {
  areAllGamesVisible = !areAllGamesVisible;
  updateGamesVisibility({ animate: areAllGamesVisible });
});

compactLayoutMediaQuery.addEventListener("change", () => {
  if (hasRenderedGames && !areAllGamesVisible) {
    updateGamesVisibility();
  }
});

mobileModalMediaQuery.addEventListener("change", scheduleModalDescriptionSync);
window.addEventListener("resize", scheduleModalDescriptionSync, { passive: true });

const renderGames = (games) => {
  gamesGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  games.forEach((game, index) => {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    const mediaWrap = node.querySelector(".game-media-wrap");
    const mediaTrack = node.querySelector(".game-media-track");
    const mediaControls = node.querySelector(".game-media-controls");
    const currentMedia = node.querySelector(".game-media-current");
    const nextMedia = node.querySelector(".game-media-next");
    const previousButton = node.querySelector(".game-media-control-prev");
    const nextButton = node.querySelector(".game-media-control-next");
    const overlayBadge = node.querySelector(".game-overlay-badge");
    const overlayYear = node.querySelector(".game-overlay-year");
    const overlayTitle = node.querySelector(".game-overlay-title");
    const status = node.querySelector(".game-status");
    const year = node.querySelector(".game-year");
    const rank = node.querySelector(".game-rank");
    const owner = node.querySelector(".game-owner");
    const title = node.querySelector(".game-heading");
    const genre = node.querySelector(".game-genre");
    const tags = node.querySelector(".game-tags");
    const detailsButton = node.querySelector(".game-details-button");
    const link = node.querySelector(".game-link");
    const ccu = node.querySelector(".game-ccu");
    const visits = node.querySelector(".game-visits");
    const favorites = node.querySelector(".game-favorites");

    node.dataset.universeId = String(game.universeId);
    node.dataset.accent = game.accent ?? "ember";

    const frames = normalizeThumbnailFrames(game.imageUrls);

    currentMedia.src = frames[0] ?? "";
    currentMedia.alt = `${game.name} thumbnail`;
    nextMedia.removeAttribute("src");
    nextMedia.alt = "";
    mediaControls.hidden = frames.length < 2;

    thumbnailTrackStates.set(mediaTrack, {
      animationToken: 0,
      currentIndex: 0,
      frames,
      isAnimating: false,
      isPointerDown: false,
      pointerDeltaX: 0,
      pointerDeltaY: 0,
      pointerId: null,
      pointerStartX: 0,
      pointerStartY: 0
    });

    rank.textContent = String(index + 1).padStart(2, "0");
    overlayBadge.textContent = game.status ?? "Live";
    overlayYear.textContent = game.year ?? "Live";
    overlayTitle.textContent = game.name;
    status.textContent = game.status ?? "Live";
    year.textContent = game.year ?? "Live";
    owner.textContent = game.creatorName;
    title.textContent = game.name;
    genre.textContent = game.genre ?? "Roblox experience";
    renderGameTags(tags, game);
    detailsButton.setAttribute("aria-label", `View details for ${game.name}`);
    link.href = game.gameUrl;
    link.setAttribute("aria-label", `Open ${game.name} on Roblox`);
    ccu.textContent = formatCompactNumber(game.playing);
    visits.textContent = formatCompactNumber(game.visits);
    favorites.textContent = formatCompactNumber(game.favorites);
    ccu.title = formatFullNumber(game.playing);
    visits.title = formatFullNumber(game.visits);
    favorites.title = formatFullNumber(game.favorites);

    attachThumbnailSwipeHandlers(mediaWrap, mediaTrack);

    detailsButton.addEventListener("click", () => {
      openGameModal(currentGamesByUniverseId.get(game.universeId) ?? game, detailsButton);
    });

    previousButton.addEventListener("click", () => {
      slideThumbnailTrack(mediaTrack, -1);
    });

    nextButton.addEventListener("click", () => {
      slideThumbnailTrack(mediaTrack, 1);
    });

    fragment.appendChild(node);
  });

  gamesGrid.appendChild(fragment);
  gamesGrid.setAttribute("aria-busy", "false");
  updateGamesVisibility();
};

const updateRenderedGames = (games) => {
  currentGamesByUniverseId = new Map(games.map((game) => [game.universeId, game]));
  const cardsByUniverseId = new Map(
    Array.from(gamesGrid.querySelectorAll(".game-card")).map((node) => [Number(node.dataset.universeId), node])
  );
  const fragment = document.createDocumentFragment();

  games.forEach((game, index) => {
    const node = cardsByUniverseId.get(game.universeId);

    if (!node) {
      return;
    }

    const ccu = node.querySelector(".game-ccu");
    const visits = node.querySelector(".game-visits");
    const favorites = node.querySelector(".game-favorites");
    const detailsButton = node.querySelector(".game-details-button");

    node.querySelector(".game-rank").textContent = String(index + 1).padStart(2, "0");
    ccu.textContent = formatCompactNumber(game.playing);
    visits.textContent = formatCompactNumber(game.visits);
    favorites.textContent = formatCompactNumber(game.favorites);
    ccu.title = formatFullNumber(game.playing);
    visits.title = formatFullNumber(game.visits);
    favorites.title = formatFullNumber(game.favorites);
    detailsButton.setAttribute("aria-label", `View details for ${game.name}`);

    fragment.appendChild(node);
  });

  gamesGrid.appendChild(fragment);
  updateGamesVisibility();

  if (activeModalUniverseId && currentGamesByUniverseId.has(activeModalUniverseId)) {
    openGameModal(currentGamesByUniverseId.get(activeModalUniverseId));
  }
};

const renderUnavailableState = () => {
  const message = document.createElement("div");
  const title = document.createElement("h3");
  const detail = document.createElement("p");

  message.className = "portfolio-empty";
  title.textContent = "Live game data is unavailable.";
  detail.textContent = "Refresh the page to try the Roblox connection again.";
  message.append(title, detail);
  gamesGrid.replaceChildren(message);
  gamesGrid.setAttribute("aria-busy", "false");
  gamesExpander.classList.add("hidden");
};

const refreshPortfolio = async () => {
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;

  if (!portfolioData) {
    portfolioData = clonePortfolioData();
    const loadingCardCount = compactLayoutMediaQuery.matches ? 2 : 3;
    renderLoadingCards(Math.min(portfolioData.games.length || loadingCardCount, loadingCardCount));
  }

  hideError();
  setRefreshMessage("Syncing live Roblox stats...");

  try {
    const universeIds = await getUniverseIds(portfolioData.games);
    const liveGameDetails = await getGameDetails(universeIds);
    let mergedGames = [];

    if (!hasRenderedGames) {
      const [liveIcons, liveThumbnails] = await Promise.all([
        getGameIcons(universeIds),
        getGameThumbnails(universeIds)
      ]);

      mergedGames = mergePortfolioData(
        portfolioData.games,
        liveGameDetails,
        liveIcons,
        liveThumbnails,
        universeIds
      );
    } else {
      mergedGames = mergePortfolioData(portfolioData.games, liveGameDetails, [], [], universeIds);
      mergedGames = mergedGames.map((game) => {
        const existingGame = currentGamesByUniverseId.get(game.universeId);

        if (!existingGame) {
          return game;
        }

        return {
          ...existingGame,
          ...game,
          iconUrl: game.iconUrl || existingGame.iconUrl,
          imageUrls: game.imageUrls.length > 0 ? game.imageUrls : existingGame.imageUrls
        };
      });
    }

    updateOverview(portfolioData.profile, mergedGames);
    currentGamesByUniverseId = new Map(mergedGames.map((game) => [game.universeId, game]));

    if (!hasRenderedGames) {
      renderGames(mergedGames);
      hasRenderedGames = true;
    } else {
      updateRenderedGames(mergedGames);
    }
  } catch (error) {
    if (hasRenderedGames) {
      showError("Live Roblox stats are temporarily unavailable. Showing the most recent synced data.");
    } else {
      showError("Live Roblox stats could not be loaded right now. Refresh to try again.");
      renderUnavailableState();
    }

    setRefreshMessage("Live data connection failed", true);
    console.error(error);
  } finally {
    isRefreshing = false;
  }
};

gameModalBackdrop.addEventListener("click", closeGameModal);
gameModal.addEventListener("click", (event) => {
  if (event.target === gameModal) {
    closeGameModal();
  }
});

modalCloseButton.addEventListener("click", closeGameModal);
document.addEventListener("keydown", (event) => {
  if (!gameModal.classList.contains("is-visible")) {
    return;
  }

  if (event.key === "Escape") {
    closeGameModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = Array.from(
    gameModal.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);

  if (focusableElements.length === 0) {
    event.preventDefault();
    gameModal.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});

modalCopyLinkButton.addEventListener("click", async () => {
  if (!activeModalUniverseId || !currentGamesByUniverseId.has(activeModalUniverseId)) {
    return;
  }

  const game = currentGamesByUniverseId.get(activeModalUniverseId);

  try {
    await navigator.clipboard.writeText(game.gameUrl);
    setModalCopyLinkLabel("Link copied");
  } catch (error) {
    setModalCopyLinkLabel("Copy unavailable");
    console.error(error);
  }

  if (copyLinkResetTimeoutId) {
    window.clearTimeout(copyLinkResetTimeoutId);
  }

  copyLinkResetTimeoutId = window.setTimeout(() => {
    setModalCopyLinkLabel("Copy game link");
    copyLinkResetTimeoutId = null;
  }, 1800);
});

modalDescriptionToggle.addEventListener("click", () => {
  const isExpanded = modalDescriptionToggle.getAttribute("aria-expanded") === "true";
  setModalDescriptionExpanded(!isExpanded);
  scheduleModalDescriptionSync();
});

heroGameButton.addEventListener("click", () => {
  if (!heroFeaturedGame) {
    return;
  }

  openGameModal(
    currentGamesByUniverseId.get(heroFeaturedGame.universeId) ?? heroFeaturedGame,
    heroGameButton
  );
});

let deckMotionFrame = null;
let deckPointerX = 0;
let deckPointerY = 0;

const renderDeckMotion = () => {
  deckMotionFrame = null;
  heroDeck.style.setProperty("--deck-rx", `${deckPointerY * -4.5}deg`);
  heroDeck.style.setProperty("--deck-ry", `${deckPointerX * 6.5}deg`);
  heroDeck.style.setProperty("--deck-x", `${deckPointerX * 6}px`);
  heroDeck.style.setProperty("--deck-y", `${deckPointerY * 5}px`);
};

const resetDeckMotion = () => {
  deckPointerX = 0;
  deckPointerY = 0;

  if (!deckMotionFrame) {
    deckMotionFrame = window.requestAnimationFrame(renderDeckMotion);
  }
};

const handleDeckPointerMove = (event) => {
  if (reducedMotionMediaQuery.matches || !finePointerMediaQuery.matches) {
    return;
  }

  const bounds = heroStage.getBoundingClientRect();
  deckPointerX = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5));
  deckPointerY = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5));

  if (!deckMotionFrame) {
    deckMotionFrame = window.requestAnimationFrame(renderDeckMotion);
  }
};

const initHeroDeckMotion = () => {
  heroStage.addEventListener("pointermove", handleDeckPointerMove, { passive: true });
  heroStage.addEventListener("pointerleave", resetDeckMotion);
  reducedMotionMediaQuery.addEventListener("change", resetDeckMotion);
  finePointerMediaQuery.addEventListener("change", resetDeckMotion);
};

/* ── Bootstrap ── */

const bootstrap = async () => {
  initHeroDeckMotion();

  try {
    await refreshPortfolio();
    window.setInterval(refreshPortfolio, REFRESH_INTERVAL_MS);
  } catch (error) {
    showError("The portfolio could not be started. Refresh to try again.");
    setRefreshMessage("Portfolio unavailable", true);
    console.error(error);
  }
};

bootstrap();
