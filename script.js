import PORTFOLIO_DATA from "./data/portfolio.json" with { type: "json" };

const REFRESH_INTERVAL_MS = 90_000;
const THUMBNAIL_CYCLE_INTERVAL_MS = 8_600;
const THUMBNAIL_INITIAL_OFFSET_MS = 3_200;
const THUMBNAIL_SLIDE_DURATION_MS = 480;
const THUMBNAIL_SWIPE_THRESHOLD_PX = 40;
const ROPROXY_ENDPOINTS = {
  universeByPlace: "https://apis.roproxy.com/universes/v1/places",
  games: "https://games.roproxy.com/v1/games",
  icons: "https://thumbnails.roproxy.com/v1/games/icons",
  thumbnails: "https://thumbnails.roproxy.com/v1/games/multiget/thumbnails"
};

const cardTemplate = document.querySelector("#gameCardTemplate");
const gamesGrid = document.querySelector("#gamesGrid");
const errorBanner = document.querySelector("#errorBanner");
const refreshState = document.querySelector("#refreshState");
const heroDescription = document.querySelector("#heroDescription");
const totalCcu = document.querySelector("#totalCcu");
const totalVisits = document.querySelector("#totalVisits");
const gameCount = document.querySelector("#gameCount");
const lastRefresh = document.querySelector("#lastRefresh");
const gameModalBackdrop = document.querySelector("#gameModalBackdrop");
const gameModal = document.querySelector("#gameModal");
const gameModalPanel = document.querySelector(".game-modal-panel");
const modalCloseButton = document.querySelector("#modalCloseButton");
const modalGameImage = document.querySelector("#modalGameImage");
const modalGameYear = document.querySelector("#modalGameYear");
const modalGameTitle = document.querySelector("#modalGameTitle");
const modalGameDescription = document.querySelector("#modalGameDescription");
const modalGameCcu = document.querySelector("#modalGameCcu");
const modalGameVisits = document.querySelector("#modalGameVisits");
const modalGameFavorites = document.querySelector("#modalGameFavorites");
const modalGameOwner = document.querySelector("#modalGameOwner");
const modalGameTags = document.querySelector("#modalGameTags");
const modalGameLink = document.querySelector("#modalGameLink");
const modalCreatorLink = document.querySelector("#modalCreatorLink");
const modalCopyLinkButton = document.querySelector("#modalCopyLinkButton");
const modalCopyLinkLabel = modalCopyLinkButton.querySelector(".button-label");

const heroSection = document.querySelector("#heroSection");
const emberCanvas = document.querySelector("#emberCanvas");
const heroCopy = document.querySelector(".hero-copy");
const heroTotalsPanel = document.querySelector(".totals-panel");
const heroScrollCue = document.querySelector(".scroll-cue");

const reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const touchViewportMediaQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
const narrowViewportMediaQuery = window.matchMedia("(max-width: 760px)");

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
let currentGamesByUniverseId = new Map();
let activeModalUniverseId = null;
let modalCloseTimeoutId = null;
let copyLinkResetTimeoutId = null;
let preloadedThumbnailUrls = new Set();
let preloadedThumbnailPromises = new Map();
let thumbnailTrackStates = new WeakMap();
let activeThumbnailTracks = new Set();

const clonePortfolioData = () => JSON.parse(JSON.stringify(PORTFOLIO_DATA));

const setRefreshMessage = (message) => {
  refreshState.textContent = message;
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
      const fallbackImageUrl = iconsByUniverse.get(universeId) ?? "";
      const imageUrls = thumbnailsByUniverse.get(universeId) ?? [];

      return {
        ...game,
        universeId,
        imageUrls: imageUrls.length > 0 ? imageUrls : [fallbackImageUrl].filter(Boolean),
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
  overviewState = {
    combinedCcu,
    combinedVisits,
    gameCount: games.length
  };
};

const buildTagItems = (game) => [game.status, game.genre, ...(game.tags ?? [])].filter(Boolean);

const renderTagItems = (container, game) => {
  container.innerHTML = "";

  buildTagItems(game).forEach((tag) => {
    const tagNode = document.createElement("span");
    tagNode.className = "tag-item";
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

const preloadThumbnail = (url) => {
  if (!url || preloadedThumbnailUrls.has(url)) {
    return;
  }

  const image = new Image();
  image.src = url;
  preloadedThumbnailUrls.add(url);
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
      preloadedThumbnailUrls.add(url);
      resolve();
    };

    image.onerror = () => {
      resolve();
    };

    image.src = url;

    if (image.complete) {
      preloadedThumbnailUrls.add(url);
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

const openGameModal = (game) => {
  if (modalCloseTimeoutId) {
    window.clearTimeout(modalCloseTimeoutId);
    modalCloseTimeoutId = null;
  }

  if (copyLinkResetTimeoutId) {
    window.clearTimeout(copyLinkResetTimeoutId);
    copyLinkResetTimeoutId = null;
  }

  activeModalUniverseId = game.universeId;
  modalGameImage.src = game.imageUrls[0] ?? "";
  modalGameImage.alt = `${game.name} thumbnail`;
  modalGameYear.textContent = game.year ?? "Live";
  modalGameTitle.textContent = game.name;
  modalGameDescription.textContent = game.description || "No public description is available for this experience right now.";
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
  setModalCopyLinkLabel("Copy Link");
  renderTagItems(modalGameTags, game);
  gameModal.classList.add("is-visible");
  gameModalBackdrop.classList.add("is-visible");
  gameModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const closeGameModal = () => {
  if (!gameModal.classList.contains("is-visible")) {
    return;
  }

  activeModalUniverseId = null;
  gameModal.classList.remove("is-visible");
  gameModalBackdrop.classList.remove("is-visible");
  gameModal.setAttribute("aria-hidden", "true");
  modalCloseTimeoutId = window.setTimeout(() => {
    document.body.style.overflow = "";
    modalCloseTimeoutId = null;
  }, 260);
};

const getThumbnailTrackState = (track) => thumbnailTrackStates.get(track);

const clearThumbnailTrackTimeout = (track) => {
  const state = getThumbnailTrackState(track);

  if (!state?.timeoutId) {
    return;
  }

  window.clearTimeout(state.timeoutId);
  state.timeoutId = null;
};

const shouldAutoRotateThumbnails = () => {
  return !reducedMotionMediaQuery.matches && !(touchViewportMediaQuery.matches && narrowViewportMediaQuery.matches);
};

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

const pauseAndResetThumbnailRotation = (track) => {
  const state = getThumbnailTrackState(track);

  if (!state) {
    return;
  }

  clearThumbnailTrackTimeout(track);
  state.hasStartedRotation = false;
};

const stopThumbnailRotation = () => {
  activeThumbnailTracks.forEach((track) => {
    const state = getThumbnailTrackState(track);

    if (state?.timeoutId) {
      window.clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
  });

  activeThumbnailTracks.clear();
};

const scheduleThumbnailRotation = (track) => {
  const state = getThumbnailTrackState(track);

  if (!state || state.frames.length < 2 || !shouldAutoRotateThumbnails()) {
    return;
  }

  clearThumbnailTrackTimeout(track);

  const isInitialSchedule = !state.hasStartedRotation;
  const delay = isInitialSchedule
    ? THUMBNAIL_CYCLE_INTERVAL_MS + Math.floor(Math.random() * THUMBNAIL_INITIAL_OFFSET_MS)
    : THUMBNAIL_CYCLE_INTERVAL_MS;

  state.timeoutId = window.setTimeout(() => {
    slideThumbnailTrack(track, 1);
  }, delay);
  state.hasStartedRotation = true;
};

const slideThumbnailTrack = async (track, direction) => {
  const state = getThumbnailTrackState(track);

  if (!state || state.frames.length < 2 || state.isAnimating) {
    return;
  }

  state.isAnimating = true;
  state.animationToken += 1;
  clearThumbnailTrackTimeout(track);

  const token = state.animationToken;
  const { frames } = state;
  const currentIndex = state.currentIndex;
  const nextIndex = (currentIndex + direction + frames.length) % frames.length;
  const afterNextIndex = (nextIndex + direction + frames.length) % frames.length;
  const currentImage = track.querySelector(".game-media-current");
  const nextImage = track.querySelector(".game-media-next");
  const directionClass = direction > 0 ? "is-sliding-forward" : "is-sliding-backward";

  await preloadThumbnailAsync(frames[nextIndex]);

  if (token !== state.animationToken) {
    state.isAnimating = false;
    return;
  }

  preloadThumbnail(frames[afterNextIndex]);

  track.classList.add("is-resetting");
  track.classList.toggle("is-prepared-backward", direction < 0);
  track.classList.remove("is-sliding-forward", "is-sliding-backward");

  nextImage.src = frames[nextIndex];
  nextImage.alt = currentImage.alt;
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
    nextImage.src = frames[afterNextIndex];
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
      scheduleThumbnailRotation(track);
    });
  }, THUMBNAIL_SLIDE_DURATION_MS);
};

const startThumbnailRotation = () => {
  stopThumbnailRotation();

  if (!shouldAutoRotateThumbnails()) {
    return;
  }

  const mediaTracks = Array.from(document.querySelectorAll(".game-media-track")).filter((node) => {
    const state = getThumbnailTrackState(node);
    return state && state.frames.length > 1;
  });

  mediaTracks.forEach((track) => {
    activeThumbnailTracks.add(track);
    scheduleThumbnailRotation(track);
  });
};

const syncThumbnailRotationMode = () => {
  if (!hasRenderedGames) {
    return;
  }

  if (shouldAutoRotateThumbnails()) {
    startThumbnailRotation();
    return;
  }

  stopThumbnailRotation();
};

const addMediaQueryListener = (query, callback) => {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", callback);
    return;
  }

  query.addListener(callback);
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

    state.suppressCardClick = true;
    pauseAndResetThumbnailRotation(mediaTrack);
    slideThumbnailTrack(mediaTrack, deltaX < 0 ? 1 : -1);

    window.setTimeout(() => {
      state.suppressCardClick = false;
    }, 280);
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

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index += 1) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    const overlayBadge = node.querySelector(".game-overlay-badge");
    const overlayYear = node.querySelector(".game-overlay-year");
    const overlayTitle = node.querySelector(".game-overlay-title");
    const status = node.querySelector(".game-status");
    const year = node.querySelector(".game-year");
    const title = node.querySelector(".game-heading");
    const link = node.querySelector(".game-link");
    const ccu = node.querySelector(".game-ccu");
    const visits = node.querySelector(".game-visits");
    const favorites = node.querySelector(".game-favorites");

    node.classList.add("loading", "is-visible");
    overlayBadge.textContent = "Loading";
    overlayYear.textContent = "--";
    overlayTitle.textContent = "Loading lineup";
    status.textContent = "Loading";
    year.textContent = "--";
    title.textContent = "Loading lineup";
    link.querySelector("span").textContent = "Open";
    ccu.textContent = "--";
    visits.textContent = "--";
    favorites.textContent = "--";

    fragment.appendChild(node);
  }

  gamesGrid.appendChild(fragment);
};

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
    const title = node.querySelector(".game-heading");
    const link = node.querySelector(".game-link");
    const ccu = node.querySelector(".game-ccu");
    const visits = node.querySelector(".game-visits");
    const favorites = node.querySelector(".game-favorites");

    node.dataset.universeId = String(game.universeId);
    node.dataset.accent = game.accent ?? "ember";
    node.style.transitionDelay = `${index * 80}ms`;
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `Open details for ${game.name}`);

    const frames = normalizeThumbnailFrames(game.imageUrls);

    currentMedia.src = frames[0] ?? "";
    currentMedia.alt = `${game.name} thumbnail`;
    nextMedia.src = frames[1] ?? frames[0] ?? "";
    nextMedia.alt = `${game.name} thumbnail`;
    mediaControls.hidden = frames.length < 2;

    frames.forEach((imageUrl, imageIndex) => {
      if (imageIndex < 3) {
        preloadThumbnail(imageUrl);
      }
    });

    thumbnailTrackStates.set(mediaTrack, {
      animationToken: 0,
      currentIndex: 0,
      frames,
      hasStartedRotation: false,
      isAnimating: false,
      isPointerDown: false,
      pointerDeltaX: 0,
      pointerDeltaY: 0,
      pointerId: null,
      pointerStartX: 0,
      pointerStartY: 0,
      suppressCardClick: false,
      timeoutId: null
    });

    overlayBadge.textContent = game.status ?? "Live";
    overlayYear.textContent = game.year ?? "Live";
    overlayTitle.textContent = game.name;
    status.textContent = game.status ?? "Live";
    year.textContent = game.year ?? "Live";
    title.textContent = game.name;
    link.href = game.gameUrl;
    link.setAttribute("aria-label", `Open ${game.name} on Roblox`);
    ccu.textContent = formatCompactNumber(game.playing);
    visits.textContent = formatCompactNumber(game.visits);
    favorites.textContent = formatCompactNumber(game.favorites);
    ccu.title = formatFullNumber(game.playing);
    visits.title = formatFullNumber(game.visits);
    favorites.title = formatFullNumber(game.favorites);

    attachThumbnailSwipeHandlers(mediaWrap, mediaTrack);

    node.addEventListener("click", (event) => {
      const state = getThumbnailTrackState(mediaTrack);

      if (state?.suppressCardClick) {
        event.preventDefault();
        state.suppressCardClick = false;
        return;
      }

      openGameModal(game);
    });

    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openGameModal(game);
    });

    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    link.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    previousButton.addEventListener("click", (event) => {
      event.stopPropagation();
      pauseAndResetThumbnailRotation(mediaTrack);
      slideThumbnailTrack(mediaTrack, -1);
    });

    nextButton.addEventListener("click", (event) => {
      event.stopPropagation();
      pauseAndResetThumbnailRotation(mediaTrack);
      slideThumbnailTrack(mediaTrack, 1);
    });

    previousButton.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    nextButton.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    fragment.appendChild(node);
  });

  gamesGrid.appendChild(fragment);
  startThumbnailRotation();
  observeGameCards();
};

const updateRenderedGames = (games) => {
  currentGamesByUniverseId = new Map(games.map((game) => [game.universeId, game]));
  const cardsByUniverseId = new Map(
    Array.from(gamesGrid.querySelectorAll(".game-card")).map((node) => [Number(node.dataset.universeId), node])
  );
  const fragment = document.createDocumentFragment();

  games.forEach((game) => {
    const node = cardsByUniverseId.get(game.universeId);

    if (!node) {
      return;
    }

    const ccu = node.querySelector(".game-ccu");
    const visits = node.querySelector(".game-visits");
    const favorites = node.querySelector(".game-favorites");

    ccu.textContent = formatCompactNumber(game.playing);
    visits.textContent = formatCompactNumber(game.visits);
    favorites.textContent = formatCompactNumber(game.favorites);
    ccu.title = formatFullNumber(game.playing);
    visits.title = formatFullNumber(game.visits);
    favorites.title = formatFullNumber(game.favorites);

    fragment.appendChild(node);
  });

  gamesGrid.appendChild(fragment);

  if (activeModalUniverseId && currentGamesByUniverseId.has(activeModalUniverseId)) {
    openGameModal(currentGamesByUniverseId.get(activeModalUniverseId));
  }
};

const refreshPortfolio = async () => {
  if (!portfolioData) {
    portfolioData = clonePortfolioData();
    renderLoadingCards(portfolioData.games.length || 3);
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
    }

    setRefreshMessage("Unable to sync live Roblox stats");
    console.error(error);
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
  if (event.key === "Escape" && gameModal.classList.contains("is-visible")) {
    closeGameModal();
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
    setModalCopyLinkLabel("Copy Link");
    copyLinkResetTimeoutId = null;
  }, 1800);
});

addMediaQueryListener(reducedMotionMediaQuery, syncThumbnailRotationMode);
addMediaQueryListener(touchViewportMediaQuery, syncThumbnailRotationMode);
addMediaQueryListener(narrowViewportMediaQuery, syncThumbnailRotationMode);

/* ── Hero Entry Reveal ── */

const REVEAL_BASE_DELAY = 120;
const WORD_STAGGER = 60;

const revealHero = () => {
  const reveals = document.querySelectorAll(".hero-reveal");

  reveals.forEach((el) => {
    const delayIndex = parseInt(el.dataset.revealDelay, 10) || 0;
    const delay = delayIndex * REVEAL_BASE_DELAY;

    const words = el.querySelectorAll(".hero-word");

    if (words.length > 0) {
      words.forEach((word, wi) => {
        window.setTimeout(() => word.classList.add("is-revealed"), delay + wi * WORD_STAGGER);
      });
    } else {
      window.setTimeout(() => el.classList.add("is-revealed"), delay);
    }
  });
};

/* ── Scroll Parallax & Fade ── */

let heroHeight = 0;
let heroScrollTicking = false;
let scrollEffectsActive = false;

const cacheHeroHeight = () => {
  heroHeight = heroSection.offsetHeight;
};

const handleHeroScroll = () => {
  heroScrollTicking = false;

  if (reducedMotionMediaQuery.matches || !scrollEffectsActive) {
    return;
  }

  const scrollY = window.scrollY;
  const deadzone = heroHeight * 0.25;
  const effectiveScroll = Math.max(scrollY - deadzone, 0);
  const progress = Math.min(effectiveScroll / (heroHeight * 0.55), 1);
  const translateY = progress * -40;
  const opacity = 1 - progress * 0.85;

  heroCopy.style.transform = `translateY(${translateY}px)`;
  heroCopy.style.opacity = opacity;
  heroTotalsPanel.style.transform = `translateY(${translateY * 0.5}px)`;
  heroTotalsPanel.style.opacity = opacity;

  if (heroScrollCue) {
    const cueOpacity = Math.max(1 - progress * 3, 0);
    heroScrollCue.style.opacity = cueOpacity;
  }
};

const initScrollEffects = () => {
  cacheHeroHeight();

  window.addEventListener("resize", cacheHeroHeight);

  window.addEventListener("scroll", () => {
    if (!heroScrollTicking) {
      heroScrollTicking = true;
      window.requestAnimationFrame(handleHeroScroll);
    }
  }, { passive: true });

  window.setTimeout(() => {
    scrollEffectsActive = true;
    heroSection.classList.add("hero-scroll-active");
  }, 700);
};

/* ── Card & Section IntersectionObserver ── */

let cardObserver = null;

const initCardObserver = () => {
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        cardObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: "0px 0px -40px 0px"
  });

  document.querySelectorAll(".scroll-reveal").forEach((el) => {
    cardObserver.observe(el);
  });
};

const observeGameCards = () => {
  if (!cardObserver) {
    return;
  }

  gamesGrid.querySelectorAll(".game-card").forEach((card) => {
    cardObserver.observe(card);
  });
};

/* ── Ember Particle System ── */

const EMBER_COLORS = ["#f97316", "#ffb366", "#ff8c3a", "#e8731a", "#ffd4a8"];
const SMOKE_COLORS = ["#c8beb4", "#b0a89e", "#9e9690", "#d4ccc4", "#a89e94"];
const EMBER_MAX_PARTICLES = 45;
const SMOKE_MAX_PARTICLES = 18;
const EMBER_FRAME_INTERVAL = 33; // ~30fps

let isHeroVisible = true;
let lastEmberFrameTime = 0;
let emberParticles = [];
let smokeParticles = [];
let emberCtx = null;
let emberDpr = 1;
let emberWidth = 0;
let emberHeight = 0;
let emberAnimationId = null;

const createEmberParticle = () => ({
  x: Math.random() * emberWidth,
  y: emberHeight + Math.random() * 20,
  vx: (Math.random() - 0.5) * 0.3,
  vy: -(0.3 + Math.random() * 0.6),
  radius: 1.5 + Math.random() * 3.5,
  maxOpacity: 0.3 + Math.random() * 0.5,
  opacity: 0,
  age: 0,
  lifetime: 180 + Math.random() * 200,
  drift: Math.random() * Math.PI * 2,
  driftSpeed: 0.008 + Math.random() * 0.012,
  driftAmplitude: 0.3 + Math.random() * 0.5,
  color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]
});

const createSmokeParticle = () => ({
  x: Math.random() * emberWidth,
  y: -20 - Math.random() * 40,
  vx: (Math.random() - 0.5) * 0.12,
  vy: 0.12 + Math.random() * 0.2,
  radius: 40 + Math.random() * 60,
  maxOpacity: 0.03 + Math.random() * 0.04,
  opacity: 0,
  age: 0,
  lifetime: 350 + Math.random() * 200,
  drift: Math.random() * Math.PI * 2,
  driftSpeed: 0.003 + Math.random() * 0.005,
  driftAmplitude: 0.5 + Math.random() * 0.7,
  growRate: 1 + Math.random() * 0.002,
  color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)]
});

const resizeEmberCanvas = () => {
  emberDpr = Math.min(window.devicePixelRatio || 1, 2);
  emberWidth = window.innerWidth;
  emberHeight = window.innerHeight;
  emberCanvas.width = emberWidth * emberDpr;
  emberCanvas.height = emberHeight * emberDpr;

  if (emberCtx) {
    emberCtx.setTransform(emberDpr, 0, 0, emberDpr, 0, 0);
  }
};

const renderEmberFrame = (timestamp) => {
  emberAnimationId = window.requestAnimationFrame(renderEmberFrame);

  if (timestamp - lastEmberFrameTime < EMBER_FRAME_INTERVAL) {
    return;
  }

  lastEmberFrameTime = timestamp;

  while (emberParticles.length < EMBER_MAX_PARTICLES) {
    emberParticles.push(createEmberParticle());
  }

  while (smokeParticles.length < SMOKE_MAX_PARTICLES) {
    smokeParticles.push(createSmokeParticle());
  }

  emberCtx.clearRect(0, 0, emberWidth, emberHeight);

  /* Draw smoke first (behind embers) */
  emberCtx.shadowBlur = 0;

  smokeParticles = smokeParticles.filter((p) => {
    p.age += 1;

    if (p.age >= p.lifetime) {
      return false;
    }

    const fadeIn = Math.min(p.age / 60, 1);
    const fadeOut = Math.min((p.lifetime - p.age) / 80, 1);

    p.opacity = p.maxOpacity * fadeIn * fadeOut;
    p.x += p.vx + Math.sin(p.drift + p.age * p.driftSpeed) * p.driftAmplitude;
    p.y += p.vy;
    p.radius *= p.growRate;

    if (p.y > emberHeight * 0.5 || p.x < -80 || p.x > emberWidth + 80) {
      return false;
    }

    const gradient = emberCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    gradient.addColorStop(0, p.color);
    gradient.addColorStop(0.4, p.color);
    gradient.addColorStop(1, "transparent");
    emberCtx.globalAlpha = p.opacity;
    emberCtx.fillStyle = gradient;
    emberCtx.beginPath();
    emberCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    emberCtx.fill();

    return true;
  });

  /* Draw embers on top */
  emberParticles = emberParticles.filter((p) => {
    p.age += 1;

    if (p.age >= p.lifetime) {
      return false;
    }

    const fadeIn = Math.min(p.age / 30, 1);
    const fadeOut = Math.min((p.lifetime - p.age) / 40, 1);

    p.opacity = p.maxOpacity * fadeIn * fadeOut;
    p.x += p.vx + Math.sin(p.drift + p.age * p.driftSpeed) * p.driftAmplitude;
    p.y += p.vy;

    if (p.x < -10 || p.x > emberWidth + 10 || p.y < -20) {
      return false;
    }

    emberCtx.beginPath();
    emberCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    emberCtx.fillStyle = p.color;
    emberCtx.globalAlpha = p.opacity;
    emberCtx.shadowColor = p.color;
    emberCtx.shadowBlur = p.radius * 6;
    emberCtx.fill();

    return true;
  });

  emberCtx.globalAlpha = 1;
  emberCtx.shadowBlur = 0;
};

const renderStaticEmbers = () => {
  resizeEmberCanvas();

  if (!emberCtx) {
    return;
  }

  const count = 8;

  for (let i = 0; i < count; i++) {
    const x = (emberWidth * (i + 0.5)) / count + (Math.random() - 0.5) * 60;
    const y = emberHeight * 0.3 + Math.random() * emberHeight * 0.5;
    const radius = 1.5 + Math.random() * 2;
    const color = EMBER_COLORS[i % EMBER_COLORS.length];

    emberCtx.beginPath();
    emberCtx.arc(x, y, radius, 0, Math.PI * 2);
    emberCtx.fillStyle = color;
    emberCtx.globalAlpha = 0.15 + Math.random() * 0.15;
    emberCtx.shadowColor = color;
    emberCtx.shadowBlur = radius * 5;
    emberCtx.fill();
  }

  emberCtx.globalAlpha = 1;
  emberCtx.shadowBlur = 0;
};

const initEmberParticles = () => {
  emberCtx = emberCanvas.getContext("2d");
  resizeEmberCanvas();

  if (reducedMotionMediaQuery.matches) {
    renderStaticEmbers();
    return;
  }

  window.addEventListener("resize", resizeEmberCanvas);
  emberAnimationId = window.requestAnimationFrame(renderEmberFrame);
};

/* ── Bootstrap ── */

const bootstrap = async () => {
  requestAnimationFrame(() => requestAnimationFrame(revealHero));

  initEmberParticles();
  initScrollEffects();
  initCardObserver();

  try {
    await refreshPortfolio();
    window.setInterval(refreshPortfolio, REFRESH_INTERVAL_MS);
  } catch (error) {
    showError("The portfolio could not be started. Refresh to try again.");
    setRefreshMessage("Portfolio unavailable");
    console.error(error);
  }
};

bootstrap();
