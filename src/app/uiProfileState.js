// v0.8.2 Round-5b (02e Step 4) — minimal singleton for active UI profile.
// GameApp.start() / regenerateWorld() write before creating workers;
// EntityFactory.createWorker reads to decide displayName format.
let _activeProfile = "casual";

export function getActiveUiProfile() {
  return _activeProfile;
}

export function setActiveUiProfile(profile) {
  _activeProfile = profile === "full" ? "full" : "casual";
}
