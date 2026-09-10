import { useState, useRef } from "react";

/**
 * A microphone button that converts speech to text using the browser's
 * built-in Web Speech API — free, no external service, no API key.
 * Works in Chrome and most Chromium-based browsers on Android/desktop.
 * Safari/iOS support is limited, so this fails gracefully if unsupported.
 *
 * Usage: <VoiceInput onResult={(text) => setInput(prev => prev + text)} />
 */
function VoiceInput({ onResult }) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const recognitionRef = useRef(null);

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setUnsupported(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript + " ");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
  }

  if (unsupported) {
    return (
      <p className="subtext">
        Voice input isn't supported in this browser — try Chrome instead.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="voice-button"
      onClick={listening ? stopListening : startListening}
      aria-label={listening ? "Stop recording" : "Speak instead of typing"}
    >
      {listening ? "🔴 Listening... (tap to stop)" : "🎤 Speak instead of typing"}
    </button>
  );
}

export default VoiceInput;
