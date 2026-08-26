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
    "com/zeel/billingscheme/billingscheme/model/MockData"
], (Controller, Fragment, BusyIndicator, JSONModel, Filter, FilterOperator, Token, MessageToast, MessageBox, MockData) => {
    "use strict";

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

            (aRawRows || []).forEach(function (oRow) {
                var sDeliveryNumber = String(oRow.DeliveryDocument || "");

                mGroupCounts[sDeliveryNumber] = (mGroupCounts[sDeliveryNumber] || 0) + 1;
            });

            var aItems = (aRawRows || []).map(function (oRow) {
                var sDeliveryNumber = String(oRow.DeliveryDocument || "");
                var iCount = mGroupCounts[sDeliveryNumber] || 1;

                return {
                    deliveryNumber: sDeliveryNumber,
                    deliveryDocumentItem: String(oRow.DeliveryDocumentItem || ""),
                    groupLabel: "Delivery " + sDeliveryNumber + " (" + iCount + " item" + (iCount > 1 ? "s" : "") + ")",
                    product: oRow.Product || "",
                    color: oRow.Color || "",
                    size: oRow.ZSize || "",
                    brand: oRow.Brand || "",
                    hsnCode: oRow.HsnCode || "",
                    bag: Number(oRow.NumberOfBags) || 0,
                    pack: Number(oRow.NumberOfPacks) || 0,
                    qty: Number(oRow.Quantity) || 0,
                    unit: oRow.BaseUnit || "",
                    rate: Number(oRow.Rate) || 0
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
                    oDialog.setModel(new JSONModel(MockData.getSchemes()), "schemes");
                    return oDialog;
                });
            }

            this._pSchemeValueHelpDialog.then(function (oDialog) {
                oDialog.open();
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
        // selected scheme; the remaining calculated columns are placeholders
        // until the calculation formulas are provided.
        // ---------------------------------------------------------------

        _rebuildBillingItems() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var oScheme = oModel.getProperty("/schemeDetails");

            if (!aItems.length || !oScheme) {
                oModel.setProperty("/billingItems", []);
                return;
            }

            var aBillingItems = aItems.map(function (oItem) {
                return {
                    srNo: oItem.srNo,
                    qty: oItem.qty,
                    unit: oItem.unit,
                    rate: oItem.rate,
                    schemeName: oScheme.SchemeName,
                    schemeType: oScheme.SchemeType,
                    discount1: oScheme.Discount1,
                    discount2: oScheme.Discount2,
                    rateAfterDisA: 0,
                    rateAfterDisB: 0,
                    valueAfterDisB: 0,
                    gstPercent: 0,
                    gstValue: 0,
                    total: 0
                };
            });

            oModel.setProperty("/billingItems", aBillingItems);
        }
    });
});
