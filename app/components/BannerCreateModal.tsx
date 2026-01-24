import { Form, useFetcher, useNavigate, useNavigation } from "@remix-run/react";
import { Banner, Button, FormLayout, InlineStack, Modal, Select, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";

interface BannerCreateModalProps {
  open: boolean;
  onClose: () => void;
  actionUrl: string;
  error?: string;
  submitWithFetcher?: boolean;
}

export function BannerCreateModal({
  open,
  onClose,
  actionUrl,
  error,
  submitWithFetcher = false,
}: BannerCreateModalProps) {
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading";
  const isFetcherSubmitting = fetcher.state !== "idle";
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [layoutValue, setLayoutValue] = useState("hero");

  useEffect(() => {
    if (!open) {
      setTitleValue("");
      setDescriptionValue("");
      setLayoutValue("hero");
    }
  }, [open]);

  useEffect(() => {
    if (!submitWithFetcher) return;
    if (fetcher.state !== "idle") return;
    const data = fetcher.data as { redirectTo?: string } | undefined;
    if (data?.redirectTo) {
      navigate(data.redirectTo);
    }
  }, [fetcher.data, fetcher.state, navigate, submitWithFetcher]);

  const FormComponent = submitWithFetcher ? fetcher.Form : Form;
  const isBusy = submitWithFetcher ? isFetcherSubmitting : isSubmitting || isLoading;

  const fetcherError =
    submitWithFetcher && fetcher.data && typeof fetcher.data === "object" && "error" in fetcher.data
      ? (fetcher.data as { error?: string }).error
      : undefined;
  const errorMessage = error || fetcherError;

  return (
    <Modal open={open} onClose={onClose} title="Create Banner" size="large">
      <Modal.Section>
        <div className="bainners-create-modal">
          {errorMessage && (
            <div style={{ marginBottom: "12px" }}>
              <Banner tone="critical" title="Error">
                <p>{errorMessage}</p>
              </Banner>
            </div>
          )}
          <FormComponent method="post" action={actionUrl} id="banner-create-form">
            <FormLayout>
              {submitWithFetcher && <input type="hidden" name="modal" value="1" />}
              <TextField
                label="Banner Title"
                name="title"
                autoComplete="off"
                placeholder="e.g., Summer Sale Hero Banner"
                value={titleValue}
                onChange={setTitleValue}
                requiredIndicator
                autoFocus
              />

              <TextField
                label="Internal Description (optional)"
                name="description"
                autoComplete="off"
                placeholder="Internal notes about this banner"
                multiline={3}
                value={descriptionValue}
                onChange={setDescriptionValue}
              />

              <Select
                label="Layout Type"
                name="layout"
                options={[
                  { label: "Hero Banner", value: "hero" },
                  { label: "Slider", value: "slider" },
                  { label: "Promo Strip", value: "promo_strip" },
                  { label: "Product Highlight", value: "product_highlight" },
                ]}
                value={layoutValue}
                onChange={setLayoutValue}
              />

              <InlineStack gap="200" align="end">
                <Button onClick={onClose} disabled={isBusy}>
                  Cancel
                </Button>
                <Button submit loading={isBusy} disabled={isBusy} primary>
                  Create Banner
                </Button>
              </InlineStack>
            </FormLayout>
          </FormComponent>
        </div>
      </Modal.Section>
    </Modal>
  );
}
