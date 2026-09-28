from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services import llm_client


class EmbeddingBatchTests(unittest.TestCase):
    def test_batches_inputs_and_preserves_embedding_order(self):
        requests = []

        class FakeEmbeddings:
            def create(self, *, model, input):
                requests.append(input)
                indexed = [
                    SimpleNamespace(index=index, embedding=[float(len(requests)), float(index)])
                    for index in range(len(input))
                ]
                return SimpleNamespace(
                    data=list(reversed(indexed)),
                    usage=SimpleNamespace(total_tokens=3),
                )

        fake_client = SimpleNamespace(embeddings=FakeEmbeddings())
        with (
            patch.object(llm_client, "_get_client", return_value=fake_client),
            patch.object(llm_client, "MAX_EMBEDDING_BATCH_TOKENS", 3),
        ):
            result = llm_client.embed_texts(["alpha beta", "gamma delta", "epsilon zeta"])

        self.assertEqual(len(requests), 3)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0][0], 1.0)
        self.assertEqual(result[1][0], 2.0)
        self.assertEqual(result[2][0], 3.0)
        self.assertTrue(all(len(batch) == 1 for batch in requests))

    def test_splits_and_retries_provider_rejected_batch(self):
        requests = []

        class TokenLimitError(Exception):
            code = "max_tokens_per_request"

        class FakeEmbeddings:
            def create(self, *, model, input):
                requests.append(input)
                if len(input) > 2:
                    raise TokenLimitError("request token limit exceeded")
                return SimpleNamespace(
                    data=[
                        SimpleNamespace(index=index, embedding=[float(index)])
                        for index in range(len(input))
                    ],
                    usage=None,
                )

        fake_client = SimpleNamespace(embeddings=FakeEmbeddings())
        with (
            patch.object(llm_client, "_get_client", return_value=fake_client),
            patch.object(llm_client, "MAX_EMBEDDING_BATCH_TOKENS", 100),
            patch.object(llm_client, "BadRequestError", TokenLimitError),
        ):
            result = llm_client.embed_texts(["alpha", "bravo", "charlie", "delta"])

        self.assertEqual(len(result), 4)
        self.assertEqual(requests[0], ["alpha", "bravo", "charlie", "delta"])
        self.assertEqual(requests[1:], [["alpha", "bravo"], ["charlie", "delta"]])

    def test_truncates_single_input_to_model_limit(self):
        received = []

        class FakeEmbeddings:
            def create(self, *, model, input):
                received.extend(input)
                return SimpleNamespace(
                    data=[SimpleNamespace(index=0, embedding=[1.0])],
                    usage=None,
                )

        fake_client = SimpleNamespace(embeddings=FakeEmbeddings())
        with (
            patch.object(llm_client, "_get_client", return_value=fake_client),
            patch.object(llm_client, "MAX_EMBEDDING_INPUT_TOKENS", 2),
        ):
            result = llm_client.embed_texts(["alpha beta gamma delta"])

        encoding = llm_client.tiktoken.encoding_for_model(llm_client.settings.openai_embedding_model)
        self.assertLessEqual(len(encoding.encode(received[0])), 2)
        self.assertEqual(result, [[1.0]])


if __name__ == "__main__":
    unittest.main()
