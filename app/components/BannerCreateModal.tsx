import { Form, useFetcher, useNavigate, useNavigation } from "@remix-run/react";
import { Banner, Button, FormLayout, InlineStack, Modal, Text, TextField, Icon } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { ImageIcon, MegaphoneIcon, SlideshowIcon } from "@shopify/polaris-icons";

interface BannerCreateModalProps {
  open: boolean;
  onClose: () => void;
  actionUrl: string;
  plan?: string;
  error?: string;
  submitWithFetcher?: boolean;
}

export function BannerCreateModal({
  open,
  onClose,
  actionUrl,
  plan,
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
  const [layoutValue, setLayoutValue] = useState("announcement");

  useEffect(() => {
    if (!open) {
      setTitleValue("");
      setDescriptionValue("");
      setLayoutValue("announcement");
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
            {submitWithFetcher && <input type="hidden" name="modal" value="1" />}
            <input type="hidden" name="layout" value={layoutValue} />
            <FormLayout>
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

              <div>
                <div className="bainners-layout-label">
                  <Text as="p" variant="bodySm">
                    Layout Type
                  </Text>
                </div>
                <div className="bainners-layout-grid">
                  <button
                    type="button"
                    className={`bainners-option-card${
                      layoutValue === "announcement" ? " bainners-option-card--selected" : ""
                    }`}
                    onClick={() => setLayoutValue("announcement")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={MegaphoneIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Announcement
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Single line + CTA + countdown
                    </Text>
                  </button>
                  <button
                    type="button"
                    className={`bainners-option-card${
                      layoutValue === "hero" ? " bainners-option-card--selected" : ""
                    }`}
                    onClick={() => setLayoutValue("hero")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={ImageIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Hero
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Single image or video
                    </Text>
                  </button>
                  <button
                    type="button"
                    className={`bainners-option-card${
                      layoutValue === "slider" ? " bainners-option-card--selected" : ""
                    }`}
                    onClick={() => {
                      setLayoutValue("slider");
                    }}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={SlideshowIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Slider
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Multiple items with transitions
                    </Text>
                  </button>
                </div>
              </div>

              <InlineStack gap="200" align="end">
                <Button onClick={onClose} disabled={isBusy}>
                  Cancel
                </Button>
                <Button submit loading={isBusy} disabled={isBusy} variant="primary">
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
