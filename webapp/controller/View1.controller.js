sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Token",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/GroupHeaderListItem"
], (Controller, Fragment, BusyIndicator, JSONModel, Filter, FilterOperator, Token, MessageToast, MessageBox, GroupHeaderListItem) => {
    "use strict";

    // Standard GST rate applied to every line until a scheme/product-specific
    // rate is required.
    var GST_RATE_PERCENT = 5;

    return Controller.extend("com.zeel.billingscheme.billingscheme.controller.View1", {

        onInit() {
            this.getView().setModel(new JSONModel({
                items: [],
                itemCount: 0,
                deliveryCount: 0,
                hasDeliveryNumbers: false,
                schemeDetails: null,
                schemeSelectedText: "",
                schemeSummaryText: "",
                hasSchemeDetails: false,
                billingItems: []
            }));

            this._mDeliveryGroupInfo = {};

            this._attachDeliveryPasteHandler();
        },

        // MultiInput's own paste-to-token splitting is unreliable for
        // multi-cell Excel pastes (rows separated by \r\n, columns by \t) -
        // it can merge/garble values instead of creating one token per cell.
        // Handling the native "paste" event ourselves guarantees every
        // pasted delivery number becomes its own token.
        _attachDeliveryPasteHandler() {
            var oInput = this.byId("deliveryInput");

            if (!oInput) {
                return;
            }

            this._fnDeliveryPasteHandler = this._onDeliveryInputPaste.bind(this);

            oInput.addEventDelegate({
                onAfterRendering: function () {
                    var oDomRef = oInput.getFocusDomRef();

                    if (oDomRef) {
                        // Capture phase + stopPropagation: MultiInput binds
                        // its own (buggy, last-value-only) paste handler
                        // directly on this same input in the bubble phase.
                        // preventDefault() alone only blocks the browser's
                        // native paste, not that sibling listener - capturing
                        // first and stopping propagation is what suppresses it.
                        oDomRef.removeEventListener("paste", this._fnDeliveryPasteHandler, true);
                        oDomRef.addEventListener("paste", this._fnDeliveryPasteHandler, true);
                    }
                }.bind(this)
            }, this);
        },

        _onDeliveryInputPaste(oNativeEvent) {
            var oClipboardData = oNativeEvent.clipboardData || window.clipboardData;
            var sText = oClipboardData ? oClipboardData.getData("text") : "";
            var aValues = this._splitDeliveryNumbers(sText);

            if (!aValues.length) {
                return;
            }

            oNativeEvent.preventDefault();
            oNativeEvent.stopPropagation();
            oNativeEvent.stopImmediatePropagation();

            var iAdded = this._addDeliveryNumbers(aValues);

            this._syncDeliveryState();

            if (iAdded) {
                MessageToast.show(iAdded + " delivery number(s) added from paste.");
            }
        },

        // ---------------------------------------------------------------
        // Delivery number entry (typed)
        // ---------------------------------------------------------------

        onDeliverySubmit(oEvent) {
            var sValue = oEvent.getParameter("value") || "";
            var oInput = oEvent.getSource();

            var iAdded = this._addDeliveryNumbers(this._splitDeliveryNumbers(sValue));

            oInput.setValue("");

            if (iAdded === 0 && sValue.trim()) {
                MessageToast.show("Delivery number already added or invalid.");
            }

            this._syncDeliveryState();
        },

        onDeliveryTokenUpdate() {
            // Fires for both pasted (auto-tokenized) and removed tokens;
            // just resync the derived counters/flags afterwards.
            setTimeout(this._syncDeliveryState.bind(this), 0);
        },

        onClearAll() {
            var oInput = this.byId("deliveryInput");

            if (oInput) {
                oInput.removeAllTokens();
            }

            var oModel = this.getView().getModel();

            oModel.setProperty("/items", []);
            oModel.setProperty("/itemCount", 0);
            oModel.setProperty("/deliveryCount", 0);
            oModel.setProperty("/schemeDetails", null);
            this._mDeliveryGroupInfo = {};
            oModel.setProperty("/schemeSelectedText", "");
            oModel.setProperty("/schemeSummaryText", "");
            oModel.setProperty("/hasSchemeDetails", false);
            oModel.setProperty("/billingItems", []);

            this._syncDeliveryState();
            MessageToast.show("Cleared.");
        },

        _splitDeliveryNumbers(sRaw) {
            return String(sRaw || "")
                .split(/[,;\n\r\t ]+/)
                .map(function (sValue) {
                    return sValue.trim().toUpperCase();
                })
                .filter(function (sValue) {
                    return !!sValue;
                });
        },

        _addDeliveryNumbers(aValues) {
            var oInput = this.byId("deliveryInput");

            if (!oInput) {
                return 0;
            }

            var mExisting = {};

            oInput.getTokens().forEach(function (oToken) {
                mExisting[oToken.getKey()] = true;
            });

            var iAdded = 0;

            (aValues || []).forEach(function (sValue) {
                if (!sValue || mExisting[sValue]) {
                    return;
                }

                mExisting[sValue] = true;
                iAdded++;

                oInput.addToken(new Token({
                    key: sValue,
                    text: sValue
                }));
            });

            return iAdded;
        },

        _syncDeliveryState() {
            var oInput = this.byId("deliveryInput");
            var oModel = this.getView().getModel();

            if (!oInput || !oModel) {
                return;
            }

            oModel.setProperty("/hasDeliveryNumbers", oInput.getTokens().length > 0);
        },

        // ---------------------------------------------------------------
        // Delivery number F4 value help
        // ---------------------------------------------------------------

        onDeliveryValueHelpRequest() {
            var oView = this.getView();

            if (!this._pDeliveryValueHelpDialog) {
                this._pDeliveryValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "com.zeel.billingscheme.billingscheme.fragment.DeliveryValueHelpDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pDeliveryValueHelpDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onDeliveryValueHelpSearch(oEvent) {
            var sQuery = oEvent.getParameter("value") || "";
            var oBinding = oEvent.getSource().getBinding("items");

            oBinding.filter(sQuery ? [
                new Filter({
                    filters: [
                        new Filter("DeliveryDocument", FilterOperator.Contains, sQuery),
                        new Filter("FullName", FilterOperator.Contains, sQuery),
                        new Filter("Customer", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ] : []);
        },

        onDeliveryValueHelpConfirm(oEvent) {
            var aSelectedContexts = oEvent.getParameter("selectedContexts") || [];

            if (!aSelectedContexts.length) {
                return;
            }

            var aValues = aSelectedContexts.map(function (oContext) {
                return String(oContext.getObject().DeliveryDocument || "").padStart(10, "0");
            });

            var iAdded = this._addDeliveryNumbers(aValues);

            this._syncDeliveryState();

            MessageToast.show(iAdded + " delivery number(s) added.");
        },

        onDeliveryValueHelpCancel(oEvent) {
            var oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        formatDeliveryDocument(sValue) {
            return String(sValue || "").padStart(10, "0");
        },

        // ---------------------------------------------------------------
        // Excel / text upload
        // ---------------------------------------------------------------

        onOpenUploadDialog() {
            var oView = this.getView();

            if (!this._pUploadDialog) {
                this._pUploadDialog = Fragment.load({
                    id: oView.getId(),
                    name: "com.zeel.billingscheme.billingscheme.fragment.UploadDeliveryDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pUploadDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseUploadDialog() {
            if (this._pUploadDialog) {
                this._pUploadDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onDeliveryFileChange(oEvent) {
            var oUploader = oEvent.getSource();
            var aFiles = oEvent.getParameter("files") || [];
            var oFile = aFiles[0];

            if (!oFile) {
                return;
            }

            this.onCloseUploadDialog();
            this._processDeliveryFile(oFile);
            oUploader.clear();
        },

        _processDeliveryFile(oFile) {
            var sExtension = String(oFile.name || "").split(".").pop().toLowerCase();

            BusyIndicator.show(0);

            var pValues = sExtension === "txt" ?
                this._readValuesFromTextFile(oFile) :
                this._readValuesFromSpreadsheet(oFile);

            pValues
                .then(function (aValues) {
                    var iAdded = this._addDeliveryNumbers(aValues);

                    this._syncDeliveryState();

                    if (!aValues.length) {
                        MessageToast.show("No delivery numbers were found in the file.");
                    } else {
                        MessageToast.show(
                            iAdded + " delivery number(s) added" +
                            (aValues.length - iAdded > 0 ? ", " + (aValues.length - iAdded) + " duplicate(s) skipped." : ".")
                        );
                    }
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error("Could not read the file: " + (oError && oError.message ? oError.message : oError));
                })
                .finally(function () {
                    BusyIndicator.hide();
                });
        },

        _readValuesFromTextFile(oFile) {
            return oFile.text().then(function (sText) {
                return this._splitDeliveryNumbers(sText);
            }.bind(this));
        },

        _readValuesFromSpreadsheet(oFile) {
            return oFile.arrayBuffer().then(function (aBuffer) {
                var oWorkbook = window.XLSX.read(aBuffer, { type: "array" });
                var oSheet = oWorkbook.Sheets[oWorkbook.SheetNames[0]];
                var aRows = window.XLSX.utils.sheet_to_json(oSheet, { header: 1, defval: "" });
                var aValues = [];

                aRows.forEach(function (aRow) {
                    var sCell = String((aRow && aRow[0]) || "").trim();

                    if (sCell && !this._isDeliveryHeaderLabel(sCell)) {
                        aValues.push(sCell.toUpperCase());
                    }
                }.bind(this));

                return aValues;
            }.bind(this));
        },

        _isDeliveryHeaderLabel(sValue) {
            var sNormalized = sValue.trim().toUpperCase().replace(/[.:]/g, "");

            return ["DELIVERY", "DELIVERY NO", "DELIVERY NUMBER", "DN", "SR NO"].indexOf(sNormalized) !== -1;
        },

        // ---------------------------------------------------------------
        // Fetch delivery items (OData V4 read)
        // ---------------------------------------------------------------

        onFetchItems() {
            var oInput = this.byId("deliveryInput");
            var oModel = this.getView().getModel();

            if (!oInput) {
                return;
            }

            var aDeliveryNumbers = oInput.getTokens().map(function (oToken) {
                return oToken.getKey();
            });

            if (!aDeliveryNumbers.length) {
                MessageToast.show("Please enter at least one delivery number first.");
                return;
            }

            BusyIndicator.show(0);

            this._readDeliveryItems(aDeliveryNumbers)
                .then(function (aAllItems) {
                    oModel.setProperty("/items", aAllItems);
                    oModel.setProperty("/itemCount", aAllItems.length);
                    oModel.setProperty("/deliveryCount", aDeliveryNumbers.length);

                    this._rebuildBillingItems();

                    MessageToast.show(
                        aAllItems.length ?
                            aAllItems.length + " line item(s) loaded for " + aDeliveryNumbers.length + " delivery number(s)." :
                            "No delivery items found for the entered delivery number(s)."
                    );
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error("Could not fetch delivery items: " + (oError && oError.message ? oError.message : oError));
                })
                .finally(function () {
                    BusyIndicator.hide();
                });
        },

        _readDeliveryItems(aDeliveryNumbers) {
            var oODataModel = this.getOwnerComponent().getModel("deliveryService");

            var aFilters = aDeliveryNumbers.map(function (sDeliveryNumber) {
                return new Filter("DeliveryDocument", FilterOperator.EQ, sDeliveryNumber);
            });
            var oCombinedFilter = new Filter({ filters: aFilters, and: false });

            var oListBinding = oODataModel.bindList("/ZCGET_DELV", undefined, [], oCombinedFilter);

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                var aRawRows = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

                return this._buildItemsFromDeliveryRows(aRawRows);
            }.bind(this));
        },

        _buildItemsFromDeliveryRows(aRawRows) {
            var mGroupCounts = {};
            var mGroupInfo = {};

            (aRawRows || []).forEach(function (oRow) {
                // Backend responses can drop leading zeros from
                // DeliveryDocument (e.g. "80000275"), but the backend's own
                // scheme-billing logic keys off the full 10-digit document
                // number - pad it back out before using it anywhere else.
                var sDeliveryNumber = String(oRow.DeliveryDocument || "").padStart(10, "0");

                mGroupCounts[sDeliveryNumber] = (mGroupCounts[sDeliveryNumber] || 0) + 1;

                if (!mGroupInfo[sDeliveryNumber]) {
                    mGroupInfo[sDeliveryNumber] = {
                        customerId: oRow.Customer || "",
                        customerName: oRow.customerName || "",
                        customerAddress: oRow.Address || ""
                    };
                }
            });

            Object.keys(mGroupCounts).forEach(function (sDeliveryNumber) {
                mGroupInfo[sDeliveryNumber].itemCount = mGroupCounts[sDeliveryNumber];
            });

            this._mDeliveryGroupInfo = mGroupInfo;

            var aItems = (aRawRows || []).map(function (oRow) {
                var sDeliveryNumber = String(oRow.DeliveryDocument || "").padStart(10, "0");

                return {
                    deliveryNumber: sDeliveryNumber,
                    deliveryDocumentItem: String(oRow.DeliveryDocumentItem || ""),
                    product: oRow.Product || "",
                    color: oRow.Color || "",
                    size: oRow.ZSize || "",
                    brand: oRow.Brand || "",
                    hsnCode: oRow.HsnCode || "",
                    bag: Number(oRow.NumberOfBags) || 0,
                    pack: Number(oRow.NumberOfPacks) || 0,
                    qty: Number(oRow.Quantity) || 0,
                    unit: oRow.BaseUnit || "",
                    rate: Number(oRow.Rate) || 0,
                    customerId: oRow.Customer || "",
                    customerName: oRow.customerName || "",
                    customerAddress: oRow.Address || ""
                };
            });

            aItems.sort(function (a, b) {
                if (a.deliveryNumber !== b.deliveryNumber) {
                    return a.deliveryNumber < b.deliveryNumber ? -1 : 1;
                }
                return a.deliveryDocumentItem < b.deliveryDocumentItem ? -1 :
                    a.deliveryDocumentItem > b.deliveryDocumentItem ? 1 : 0;
            });

            aItems.forEach(function (oItem, iIndex) {
                oItem.srNo = iIndex + 1;
            });

            return aItems;
        },

        getDeliveryGroupHeader(oGroup) {
            var sDeliveryNumber = oGroup.key;
            var oInfo = (this._mDeliveryGroupInfo && this._mDeliveryGroupInfo[sDeliveryNumber]) || {};
            var sCount = oInfo.itemCount ? oInfo.itemCount + " item" + (oInfo.itemCount > 1 ? "s" : "") : "";
            var sTitle = "Delivery " + sDeliveryNumber + (sCount ? " (" + sCount + ")" : "");

            if (oInfo.customerName) {
                sTitle += "  •  " + oInfo.customerName;
            }

            if (oInfo.customerAddress) {
                sTitle += "  •  " + oInfo.customerAddress;
            }

            return new GroupHeaderListItem({
                title: sTitle,
                tooltip: oInfo.customerAddress || undefined,
                upperCase: false
            });
        },

        // ---------------------------------------------------------------
        // Scheme selection
        // ---------------------------------------------------------------

        onSchemeValueHelpRequest() {
            var oView = this.getView();

            if (!this._pSchemeValueHelpDialog) {
                this._pSchemeValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "com.zeel.billingscheme.billingscheme.fragment.SchemeValueHelpDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    oDialog.setModel(new JSONModel([]), "schemes");
                    return oDialog;
                });
            }

            this._pSchemeValueHelpDialog.then(function (oDialog) {
                oDialog.open();
                oDialog.setBusy(true);

                this._readSchemes()
                    .then(function (aSchemes) {
                        oDialog.getModel("schemes").setData(aSchemes);
                    })
                    .catch(function (oError) {
                        MessageBox.error("Could not fetch schemes: " + (oError && oError.message ? oError.message : oError));
                    })
                    .finally(function () {
                        oDialog.setBusy(false);
                    });
            }.bind(this));
        },

        _readSchemes() {
            // The backend's Scheme entity set fans out one row per Customer
            // for the same underlying document (its declared OData key is
            // just AccountingDocument/AccountingDocumentItem/PostingDate),
            // so two customers sharing a scheme produce duplicate key
            // predicates. Reading it via bindList()/requestContexts() makes
            // the OData v4 model build a keyed cache and throw "Duplicate
            // key predicate" on those rows. We only need the scheme
            // definition (not a live-bound entity), so read the raw JSON
            // directly instead and de-duplicate on the client.
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");

            return fetch(sServiceUri + "Scheme", {
                headers: { "Accept": "application/json" }
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }
                return oResponse.json();
            }).then(function (oData) {
                var aRows = (oData && oData.value) || [];
                var mSeen = {};
                var aSchemes = [];

                aRows.forEach(function (oRow) {
                    var sDedupeKey = [oRow.SchemeName, oRow.scheme_type, oRow.DiscountA, oRow.DiscountB, oRow.Amount].join("|");

                    if (mSeen[sDedupeKey]) {
                        return;
                    }
                    mSeen[sDedupeKey] = true;

                    aSchemes.push({
                        AccountingDocument: oRow.AccountingDocument,
                        AccountingDocumentItem: oRow.AccountingDocumentItem,
                        SchemeName: oRow.SchemeName,
                        SchemeType: oRow.scheme_type,
                        Discount1: oRow.DiscountA + "%",
                        Discount2: oRow.DiscountB + "%",
                        AdvAmount: oRow.Amount,
                        Currency: oRow.CompanyCodeCurrency
                    });
                });

                return aSchemes;
            });
        },

        onSchemeValueHelpSearch(oEvent) {
            var sQuery = oEvent.getParameter("value") || "";
            var oBinding = oEvent.getSource().getBinding("items");

            oBinding.filter(sQuery ? [
                new Filter({
                    filters: [
                        new Filter("SchemeName", FilterOperator.Contains, sQuery),
                        new Filter("SchemeType", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ] : []);
        },

        onSchemeValueHelpConfirm(oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");

            if (!oSelectedItem) {
                return;
            }

            var oSchemeDetails = oSelectedItem.getBindingContext("schemes").getObject();
            var oModel = this.getView().getModel();

            oModel.setProperty("/schemeDetails", oSchemeDetails);
            oModel.setProperty("/schemeSelectedText", oSchemeDetails.SchemeName + " (" + oSchemeDetails.SchemeType + ")");
            oModel.setProperty("/schemeSummaryText", this._formatSchemeSummary(oSchemeDetails));
            oModel.setProperty("/hasSchemeDetails", true);

            this._rebuildBillingItems();

            MessageToast.show("\"" + oSchemeDetails.SchemeName + "\" scheme selected.");
        },

        onSchemeValueHelpCancel(oEvent) {
            var oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _formatSchemeSummary(oSchemeDetails) {
            oSchemeDetails = oSchemeDetails || {};

            return "Scheme: " + oSchemeDetails.SchemeName +
                "  |  Type: " + oSchemeDetails.SchemeType +
                "  |  Discount 1: " + oSchemeDetails.Discount1 +
                "  |  Discount 2: " + oSchemeDetails.Discount2 +
                "  |  Adv Amount: " + oSchemeDetails.AdvAmount;
        },

        // ---------------------------------------------------------------
        // Billing details (Scheme Name/Type/Dis 1/Dis 2 come from the
        // selected scheme; the remaining columns are calculated per line:
        //   Rate After Dis A = Rate - (Rate * Dis1)
        //   Rate After Dis B = Rate After Dis A - (Rate After Dis A * Dis2)
        //   Value after Dis B = Rate After Dis B * Qty
        //   GST Value = Value after Dis B * GST%
        //   Total = Value after Dis B + GST Value
        // ---------------------------------------------------------------

        _rebuildBillingItems() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var oScheme = oModel.getProperty("/schemeDetails");

            if (!aItems.length || !oScheme) {
                oModel.setProperty("/billingItems", []);
                return;
            }

            var fDisc1 = this._parsePercent(oScheme.Discount1);
            var fDisc2 = this._parsePercent(oScheme.Discount2);

            var aBillingItems = aItems.map(function (oItem) {
                var fRate = oItem.rate || 0;
                var fQty = oItem.qty || 0;

                var fRateAfterDisA = this._round2(fRate - (fRate * fDisc1));
                var fRateAfterDisB = this._round2(fRateAfterDisA - (fRateAfterDisA * fDisc2));
                var fValueAfterDisB = this._round2(fRateAfterDisB * fQty);
                var fGstValue = this._round2(fValueAfterDisB * (GST_RATE_PERCENT / 100));
                var fTotal = this._round2(fValueAfterDisB + fGstValue);

                return {
                    srNo: oItem.srNo,
                    qty: oItem.qty,
                    unit: oItem.unit,
                    rate: oItem.rate,
                    schemeName: oScheme.SchemeName,
                    schemeType: oScheme.SchemeType,
                    discount1: oScheme.Discount1,
                    discount2: oScheme.Discount2,
                    rateAfterDisA: fRateAfterDisA,
                    rateAfterDisB: fRateAfterDisB,
                    valueAfterDisB: fValueAfterDisB,
                    gstPercent: GST_RATE_PERCENT + "%",
                    gstValue: fGstValue,
                    total: fTotal
                };
            }.bind(this));

            oModel.setProperty("/billingItems", aBillingItems);
        },

        _parsePercent(sValue) {
            var fValue = parseFloat(String(sValue || "0").replace("%", ""));

            return isNaN(fValue) ? 0 : fValue / 100;
        },

        _round2(fValue) {
            return Math.round((fValue + Number.EPSILON) * 100) / 100;
        },

        _parseAmount(sValue) {
            var fValue = parseFloat(String(sValue || "0").replace(/,/g, ""));

            return isNaN(fValue) ? 0 : fValue;
        },

        _formatDate(oDate) {
            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");

            return sYear + "-" + sMonth + "-" + sDay;
        },

        // ---------------------------------------------------------------
        // Post scheme billing
        // ---------------------------------------------------------------

        onPostScheme() {
            var oModel = this.getView().getModel();
            var aBillingItems = oModel.getProperty("/billingItems") || [];

            if (!aBillingItems.length) {
                MessageToast.show("Fetch delivery items and select a scheme before posting.");
                return;
            }

            var oPayload = this._buildSchemeBillingPayload();

            BusyIndicator.show(0);

            this._postSchemeBilling(oPayload)
                .then(function () {
                    BusyIndicator.hide();
                    MessageBox.success("Scheme billing posted successfully.", {
                        title: "Success"
                    });
                })
                .catch(function (oError) {
                    BusyIndicator.hide();
                    MessageBox.error("Could not post scheme billing: " + (oError && oError.message ? oError.message : oError));
                });
        },

        _buildSchemeBillingPayload() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var aBillingItems = oModel.getProperty("/billingItems") || [];
            var oScheme = oModel.getProperty("/schemeDetails") || {};

            var aDeliveries = [];
            var mSeenDeliveries = {};

            aItems.forEach(function (oItem) {
                if (!mSeenDeliveries[oItem.deliveryNumber]) {
                    mSeenDeliveries[oItem.deliveryNumber] = true;
                    aDeliveries.push({ DeliveryDocument: oItem.deliveryNumber });
                }
            });

            var sSchemeType = String(oScheme.SchemeType || "").toUpperCase();
            var fDiscount1 = this._parsePercent(oScheme.Discount1) * 100;
            var fDiscount2 = this._parsePercent(oScheme.Discount2) * 100;
            var fAdvanceAmount = this._parseAmount(oScheme.AdvAmount);

            var fInvoiceTotal = this._round2(aBillingItems.reduce(function (fSum, oBillingItem) {
                return fSum + (oBillingItem.total || 0);
            }, 0));

            var aPostItems = aItems.map(function (oItem, iIndex) {
                var oBillingItem = aBillingItems[iIndex] || {};

                return {
                    DeliveryDocument: oItem.deliveryNumber,
                    DeliveryDocumentItem: oItem.deliveryDocumentItem,
                    Product: oItem.product,
                    Color: oItem.color,
                    SizeName: oItem.size,
                    Brand: oItem.brand,
                    HSNCode: oItem.hsnCode,
                    Bag: oItem.bag,
                    Pack: oItem.pack,
                    Quantity: oItem.qty,
                    Unit: oItem.unit,
                    Rate: oItem.rate,
                    SchemeName: oScheme.SchemeName,
                    SchemeType: sSchemeType,
                    Discount1: fDiscount1,
                    Discount2: fDiscount2,
                    RateAfterDiscount1: oBillingItem.rateAfterDisA,
                    RateAfterDiscount2: oBillingItem.rateAfterDisB,
                    TaxableAmount: oBillingItem.valueAfterDisB,
                    GSTPercent: GST_RATE_PERCENT,
                    GSTAmount: oBillingItem.gstValue,
                    TotalAmount: oBillingItem.total,
                    Currency: "INR"
                };
            });

            return {
                SchemeName: oScheme.SchemeName,
                SchemeType: sSchemeType,
                BillingDate: this._formatDate(new Date()),
                Discount1: fDiscount1,
                Discount2: fDiscount2,
                AdvanceAmount: fAdvanceAmount,
                InvoiceTotal: fInvoiceTotal,
                AdvanceBalance: fAdvanceAmount,
                Currency: "INR",
                _Deliveries: aDeliveries,
                _Items: aPostItems
            };
        },

        _postSchemeBilling(oPayload) {
            // This action expects the payload as the raw request body, not
            // wrapped under a named OData action parameter - so the OData v4
            // model's operation-binding API (bindContext/setParameter, which
            // always wraps parameters per protocol) can't send it correctly.
            // A plain POST is used instead; SAP Gateway still enforces CSRF
            // on it, so a token is fetched first.
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");
            var sActionUrl = sServiceUri + "SchemeBilling/com.sap.gateway.srvd.zsd_delivery_api.v0001.PostSchemeBilling";

            return this._fetchCsrfToken(sServiceUri).then(function (sToken) {
                return fetch(sActionUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "X-CSRF-Token": sToken
                    },
                    body: JSON.stringify(oPayload)
                });
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error("HTTP " + oResponse.status + (sText ? ": " + sText : ""));
                    });
                }

                return oResponse.status === 204 ? null : oResponse.json();
            });
        },

        _fetchCsrfToken(sServiceUri) {
            return fetch(sServiceUri + "$metadata", {
                method: "GET",
                headers: { "X-CSRF-Token": "Fetch" }
            }).then(function (oResponse) {
                return oResponse.headers.get("X-CSRF-Token") || "";
            });
        }
    });
});
