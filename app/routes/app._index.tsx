import { useState, useEffect, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router-dom";

import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  BlockStack,
  Text,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Form,
  InlineStack,
  Icon,
  Divider,
  Banner,
  Badge,
  Tag,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { ProductIcon, DatabaseIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import "../styles/app-index.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "saveMetafield") {
    return { success: false, errors: [{ message: "Invalid action" }] };
  }

  const customData = String(formData.get("customData") || "");
  const productIds = JSON.parse(String(formData.get("productIds") || "[]")) as string[];

  const NAMESPACE = "product_metafield_app";
  const KEY = "custom_info";
  const TYPE = "string";

  const errors: Array<{ field?: string[]; message: string }> = [];

  // I add this to save the same value to all selected products
  for (const productId of productIds) {
    const res = await admin.graphql(
      `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            { ownerId: productId, namespace: NAMESPACE, key: KEY, type: TYPE, value: customData },
          ],
        },
      },
    );

    const json = await res.json();
    const userErrors = json?.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length) errors.push(...userErrors);
  }

  return errors.length
    ? { success: false, errors, actionType: "metafield" as const }
    : { success: true, actionType: "metafield" as const };
};

// ! ClientOnly to avoid App Bridge on the server 
function ClientOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <>{children}</> : <>{fallback ?? null}</>;
}
export default function Index() {
  const fetcher = useFetcher<typeof action>();

  return (
    <div className="page">
      <Page fullWidth>
        <ClientOnly
          fallback={
            <Layout>
              <Layout.Section>
                <Card>
                  <Box padding="400">
                    <Text as="p" tone="subdued">Loading…</Text>
                  </Box>
                </Card>
              </Layout.Section>
            </Layout>
          }
        >
          <SaveMetafield fetcher={fetcher} />
        </ClientOnly>
      </Page>
    </div>
  );
}

import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";
import { ResourcePicker } from "@shopify/app-bridge/actions";
import type { ClientApplication } from "@shopify/app-bridge";

type FetcherWithAction = ReturnType<typeof useFetcher<typeof action>>;

type ProductLike = {
  id: string;
  title: string;
  images?: Array<{ originalSrc?: string; altText?: string }>;
};

function SaveMetafield({ fetcher }: { fetcher: FetcherWithAction }) {
  const shopify = useAppBridge();
  const appBridgeApp: ClientApplication<any> =
    (((shopify as any)?.app ?? shopify) as ClientApplication<any>);

  const [customData, setCustomData] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<ProductLike[]>([]);

  const isSaving =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "saveMetafield";

  const disableSave = isSaving || selectedProducts.length === 0 || !customData.trim();
  const productCount = selectedProducts.length;

  // Msg after save
  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.actionType === "metafield" && fetcher.data.success) {
      (shopify as any).toast?.show?.("Metafield saved.");
      setCustomData("");
      setSelectedProducts([]);
    } else if (!fetcher.data.success && fetcher.data.errors) {
      const msg = fetcher.data.errors[0]?.message || "Unknown error";
      (shopify as any).toast?.show?.(`Error: ${msg}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // ? Opening product picker ( dialog ) 
  const openProductPicker = async () => {
    if ((shopify as any).resourcePicker) {
      const selection = await (shopify as any).resourcePicker({
        type: "product",
        multiple: true,
      });
      if (selection) setSelectedProducts(selection);
      return;
    }
    const picker = ResourcePicker.create(appBridgeApp, {
      resourceType: ResourcePicker.ResourceType.Product,
      options: { selectMultiple: true },
    });
    picker.subscribe(ResourcePicker.Action.SELECT, ({ selection }) => setSelectedProducts(selection));
    picker.dispatch(ResourcePicker.Action.OPEN);
  };

  const handleCancel = () => {
    setCustomData("");
    setSelectedProducts([]);
    (shopify as any).toast?.show?.("Cleared.");
  };

  const removeProduct = (id: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const selectedTags = useMemo(
    () =>
      selectedProducts.slice(0, 6).map((p) => (
        <Tag key={p.id} onRemove={() => removeProduct(p.id)}>
          {p.title}
        </Tag>
      )),
    [selectedProducts],
  );

  return (
    <>
      <TitleBar title="Product metafields" />

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">

              <Banner tone="info">
                This action writes the same <b>string</b> metafield value to every selected product.
              </Banner>

              <Divider />

              {/* Product picker && summary */}
              <InlineStack gap="300" align="start" wrap>
                <Button
                  size="large"
                  icon={ProductIcon}
                  onClick={openProductPicker}
                  disabled={isSaving}
                >
                  {productCount ? `Select products (${productCount})` : "Select products"}
                </Button>

                {productCount > 0 && (
                  <InlineStack gap="200" align="center" blockAlign="center" wrap>
                    <Badge tone="success">{`${productCount} selected`}</Badge>
                    <div className="tags-wrap">
                      <InlineStack gap="150" wrap>
                        {selectedTags}
                        {productCount > 6 && <Badge>{`+${productCount - 6} more`}</Badge>}
                      </InlineStack>
                    </div>
                  </InlineStack>
                )}
              </InlineStack>

              {/* Selected productss */}
              <div className="product-box">
                {productCount === 0 ? (
                  <EmptyState
                    heading="No products selected"
                    image=""
                    action={{ content: "Choose products", onAction: openProductPicker }}
                  >
                    <p>Select products to see them here and save your metafield value.</p>
                  </EmptyState>
                ) : (
                  <ResourceList
                    resourceName={{ singular: "product", plural: "products" }}
                    items={selectedProducts}
                    renderItem={(item: ProductLike) => {
                      const media = (
                        <div className="thumb">
                          <Thumbnail
                            source={item.images?.[0]?.originalSrc || ""}
                            alt={item.images?.[0]?.altText || item.title}
                          />
                        </div>
                      );
                      return (
                        <ResourceItem
                          id={item.id}
                          media={media}
                          accessibilityLabel={item.title}
                          onClick={() => { }}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="bodyMd" fontWeight="bold">
                              {item.title}
                            </Text>
                            <Button
                              variant="tertiary"
                              tone="critical"
                              icon={DeleteIcon}
                              onClick={() => removeProduct(item.id)}
                              accessibilityLabel={`Remove ${item.title}`}
                            />
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                )}
              </div>

              {/* Form */}
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (disableSave) return;
                  fetcher.submit(
                    {
                      intent: "saveMetafield",
                      customData,
                      productIds: JSON.stringify(selectedProducts.map((p) => p.id)),
                    },
                    { method: "POST" },
                  );
                }}
              >
                <BlockStack gap="300">
                  <TextField
                    label="Custom data to save"
                    value={customData}
                    onChange={setCustomData}
                    autoComplete="off"
                    placeholder="e.g., Special Edition 2025"
                    disabled={isSaving}
                    helpText="Stored to namespace “product_metafield_app”, key “custom_info”."
                  />

                  <div className="actions">
                    <InlineStack gap="200" align="end">
                      <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button submit variant="primary" loading={isSaving} disabled={disableSave}>
                        {`Save to ${productCount || 0} product${productCount === 1 ? "" : "s"}`}
                      </Button>
                    </InlineStack>
                  </div>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </>
  );
}
