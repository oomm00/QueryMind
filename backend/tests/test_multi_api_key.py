import pytest
from unittest.mock import MagicMock
from app.core.config import Settings
from app.services.generation_service import GeminiAdapter

def test_settings_gemini_api_keys_parsing(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "key1")
    monkeypatch.setenv("GEMINI_BACKUP_API_KEY", "key2")
    s = Settings(_env_file=None)
    assert s.gemini_api_keys == ["key1", "key2"]

def test_settings_gemini_api_keys_comma_separated(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "keyA, keyB")
    monkeypatch.setenv("GEMINI_BACKUP_API_KEY", "keyC")
    s = Settings(_env_file=None)
    assert s.gemini_api_keys == ["keyA", "keyB", "keyC"]

def test_gemini_adapter_fails_over_to_backup_key_on_429():
    mock_client1 = MagicMock()
    mock_client1.models.generate_content.side_effect = Exception("429 RESOURCE_EXHAUSTED: quota exceeded")

    mock_resp = MagicMock()
    mock_resp.text = '{"question": "test", "correct_answer": "ans", "bloom_level": "remember", "difficulty": "easy"}'
    mock_resp.candidates = []

    # Adapter initialized with mock_client1 and 2 keys
    adapter = GeminiAdapter(
        client=mock_client1,
        model="gemini-3.1-flash-lite",
        temperature=0.3,
        api_keys=["primary_key", "backup_key"],
    )

    # When generate_content is called, it catches 429 on primary, swaps client to backup_key and calls again
    # We patch genai.Client so that creating the backup client returns a mock that succeeds
    mock_backup_client = MagicMock()
    mock_backup_client.models.generate_content.return_value = mock_resp

    with pytest.MonkeyPatch.context() as mp:
        import google.genai as genai
        mp.setattr(genai, "Client", lambda api_key: mock_backup_client if api_key == "backup_key" else mock_client1)
        res = adapter.generate_content("hello")
        assert res == mock_resp
        assert adapter._current_key_idx == 1
        mock_backup_client.models.generate_content.assert_called_once()
