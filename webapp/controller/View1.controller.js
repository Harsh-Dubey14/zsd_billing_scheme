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

    return Controller.extend("com.zeel.billingscheme.billingscheme.controller.View1", {

        onInit() {
            this.getView().setModel(new JSONModel({
                items: [],
                postingComplete: false,
                posting: false,
                transactionCurrency: "",
                itemCount: 0,
                deliveryCount: 0,
                hasDeliveryNumbers: false,
                schemeDetails: null,
                schemeType: "",
                schemeSelectedText: "",
                schemeSummaryText: "",
                hasSchemeDetails: false,
                billingItems: [],
                billingTotal: 0,
                schemeValid: true,
                schemeErrorText: ""
            }));

            this._mDeliveryGroupInfo = {};
            this._sDeliveryValueHelpAnchorFullName = null;

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

        onClearDeliveryInput() {
            var oInput = this.byId("deliveryInput");
            if (oInput) {
                oInput.removeAllTokens();
                oInput.setValue("");
                this._syncDeliveryState();
            }
        },

        onClearAll() {
            MessageBox.warning("Clear all delivery numbers, selected schemes, and billing details? This will discard the current entries.", {
                title: "Clear billing details?",
                actions: ["Clear", MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.CANCEL,
                initialFocus: MessageBox.Action.CANCEL,
                onClose: function (sAction) {
                    if (sAction === "Clear") {
                        this._clearAll();
                    }
                }.bind(this)
            });
        },

        onNewBilling() {
            this._clearAll();
        },

        _clearAll() {
            var oInput = this.byId("deliveryInput");

            if (oInput) {
                oInput.removeAllTokens();
                oInput.setValue("");
            }

            var oModel = this.getView().getModel();

            oModel.setProperty("/postingComplete", false);
            oModel.setProperty("/items", []);
            oModel.setProperty("/transactionCurrency", "");
            oModel.setProperty("/itemCount", 0);
            oModel.setProperty("/deliveryCount", 0);
            oModel.setProperty("/schemeDetails", null);
            oModel.setProperty("/schemeType", "");
            this._mDeliveryGroupInfo = {};
            oModel.setProperty("/schemeSelectedText", "");
            oModel.setProperty("/schemeSummaryText", "");
            oModel.setProperty("/hasSchemeDetails", false);
            oModel.setProperty("/billingItems", []);
            oModel.setProperty("/billingTotal", 0);
            oModel.setProperty("/schemeValid", true);
            oModel.setProperty("/schemeErrorText", "");

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
                    this._attachDeliverySelectionGuard(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._pDeliveryValueHelpDialog.then(function (oDialog) {
                this._sDeliveryValueHelpAnchorFullName = null;
                oDialog.open();
            }.bind(this));
        },

        // TableSelectDialog doesn't expose its multi-select checkbox toggles
        // as a public event, so this reaches into its internal list (a plain
        // sap.m.Table, exposed as `_oList` since the control's introduction)
        // to enforce "one customer's deliveries at a time": the first row
        // checked fixes the customer (by FullName) for the rest of this
        // dialog session - any row belonging to a different customer is
        // immediately unchecked again, and the customer resets once every
        // row is deselected.
        _attachDeliverySelectionGuard(oDialog) {
            var oList = oDialog._oList;

            if (!oList) {
                return;
            }

            oList.attachSelectionChange(function (oEvent) {
                if (oEvent.getParameter("selectAll")) {
                    this._enforceDeliverySelectionGuard(oList);
                    return;
                }

                var oListItem = oEvent.getParameter("listItem");
                var bSelected = oEvent.getParameter("selected");

                if (!oListItem || !bSelected) {
                    if (!oList.getSelectedItems().length) {
                        this._sDeliveryValueHelpAnchorFullName = null;
                    }
                    return;
                }

                var sFullName = oListItem.getBindingContext("deliveryService").getObject().FullName || "";

                if (this._sDeliveryValueHelpAnchorFullName === null) {
                    this._sDeliveryValueHelpAnchorFullName = sFullName;
                    return;
                }

                if (sFullName !== this._sDeliveryValueHelpAnchorFullName) {
                    oList.setSelectedItem(oListItem, false);
                    MessageToast.show(this._getDeliverySelectionGuardMessage());
                }
            }, this);
        },

        _enforceDeliverySelectionGuard(oList) {
            var aSelected = oList.getSelectedItems();

            if (!aSelected.length) {
                this._sDeliveryValueHelpAnchorFullName = null;
                return;
            }

            var sAnchor = this._sDeliveryValueHelpAnchorFullName;

            if (sAnchor === null) {
                sAnchor = aSelected[0].getBindingContext("deliveryService").getObject().FullName || "";
                this._sDeliveryValueHelpAnchorFullName = sAnchor;
            }

            var iRemoved = 0;

            aSelected.forEach(function (oListItem) {
                var sFullName = oListItem.getBindingContext("deliveryService").getObject().FullName || "";

                if (sFullName !== sAnchor) {
                    oList.setSelectedItem(oListItem, false);
                    iRemoved++;
                }
            });

            if (iRemoved) {
                MessageToast.show(this._getDeliverySelectionGuardMessage());
            }
        },

        _getDeliverySelectionGuardMessage() {
            return "Only delivery numbers for the same customer can be selected together" +
                (this._sDeliveryValueHelpAnchorFullName ? " (" + this._sDeliveryValueHelpAnchorFullName + ")" : "") +
                ". Deselect all to pick a different customer.";
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

            this._sDeliveryValueHelpAnchorFullName = null;

            if (!aSelectedContexts.length) {
                return;
            }

            var aRows = aSelectedContexts.map(function (oContext) {
                return oContext.getObject();
            });

            // Safety net in case the live selection guard couldn't attach
            // (e.g. a future UI5 version drops the internal `_oList`) -
            // still refuse a mixed-customer selection at confirm time.
            var sFullName = aRows[0].FullName || "";
            var bMixedCustomers = aRows.some(function (oRow) {
                return (oRow.FullName || "") !== sFullName;
            });

            if (bMixedCustomers) {
                MessageBox.error("Selected delivery numbers belong to different customers. Please select delivery numbers for a single customer only.");
                return;
            }

            var aValues = aRows.map(function (oRow) {
                return String(oRow.DeliveryDocument || "").padStart(10, "0");
            });

            var iAdded = this._addDeliveryNumbers(aValues);

            this._syncDeliveryState();

            MessageToast.show(iAdded + " delivery number(s) added.");
        },

        onDeliveryValueHelpCancel(oEvent) {
            var oBinding = oEvent.getSource().getBinding("items");

            this._sDeliveryValueHelpAnchorFullName = null;

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
                    var sValidationError = this._getDeliveryValidationError(aAllItems);
                    if (sValidationError) {
                        oModel.setProperty("/items", []);
                        oModel.setProperty("/itemCount", 0);
                        oModel.setProperty("/deliveryCount", 0);
                        this._mDeliveryGroupInfo = {};
                        this._rebuildBillingItems();
                        MessageBox.error(sValidationError, { title: "Delivery cannot be billed" });
                        return;
                    }
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

        _getDeliveryValidationError(aItems) {
            var aPgiPending = [];
            var aInvoiced = [];
            (aItems || []).forEach(function (oItem) {
                if (!String(oItem.billingDocumentDate || "").trim() && aPgiPending.indexOf(oItem.deliveryNumber) === -1) {
                    aPgiPending.push(oItem.deliveryNumber);
                }
                if (String(oItem.invoiceStatus || "").trim().toUpperCase() === "CREATED" && aInvoiced.indexOf(oItem.deliveryNumber) === -1) {
                    aInvoiced.push(oItem.deliveryNumber);
                }
            });
            var aErrors = [];
            if (aPgiPending.length) {
                aErrors.push("PGI pending: " + aPgiPending.join(", "));
            }
            if (aInvoiced.length) {
                aErrors.push("Invoice already created: " + aInvoiced.join(", "));
            }
            return aErrors.join("\n\n");
        },

        _readDeliveryItems(aDeliveryNumbers) {
            // ZCGET_DELV's declared OData key is just DeliveryDocument, but
            // the backend returns one row per line item - a delivery with
            // several items produces multiple rows sharing that same key,
            // so bindList()/requestContexts() throws "Duplicate key
            // predicate" the same way the Scheme entity did. Read the raw
            // JSON directly instead.
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");

            var sFilter = aDeliveryNumbers.map(function (sDeliveryNumber) {
                return "DeliveryDocument eq '" + sDeliveryNumber.replace(/'/g, "''") + "'";
            }).join(" or ");

            var sUrl = sServiceUri + "ZCGET_DELV?$filter=" + encodeURIComponent(sFilter);

            return fetch(sUrl, {
                headers: { "Accept": "application/json" }
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }
                return oResponse.json();
            }).then(function (oData) {
                var aRawRows = (oData && oData.value) || [];

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
                    productDescription: oRow.ProductDescription || "",
                    billingDocumentDate: oRow.PGIDate || "",
                    invoiceStatus: oRow.InvoiceStatus || "",
                    salesOrganization: oRow.SalesOrganization || "",
                    destinationCountry: oRow.DestinationCountry || "",
                    sdDocumentCategory: oRow.SDDocumentCategory || "",
                    color: oRow.Color || "",
                    size: oRow.ZSize || "",
                    brand: oRow.Brand || "",
                    hsnCode: oRow.HsnCode || "",
                    bag: Number(oRow.NumberOfBags) || 0,
                    pack: Number(oRow.NumberOfPacks) || 0,
                    qty: Number(oRow.Quantity) || 0,
                    unit: oRow.BaseUnit || "",
                    rate: Number(oRow.Rate) || 0,
                    transactionCurrency: oRow.TransactionCurrency || "",
                    gstRate: Number(oRow.GstRate) || 0,
                    customerId: oRow.Customer || "",
                    customerName: oRow.customerName || "",
                    customerAddress: oRow.Address || "",
                    quantityinbaseunit: oRow.quantityinbaseunit || 0,
                    actualUom: oRow.actualuom || ""
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

        onSchemeTypeChange(oEvent) {
            var oModel = this.getView().getModel();
            var sType = oEvent.getSource().getSelectedKey();
            oModel.setProperty("/schemeType", sType);
            oModel.setProperty("/schemeDetails", null);
            oModel.setProperty("/schemeSelectedText", "");
            oModel.setProperty("/schemeSummaryText", "");
            oModel.setProperty("/hasSchemeDetails", false);
            this._rebuildBillingItems();
        },

        onSchemeValueHelpRequest() {
            var oView = this.getView();
            var sSchemeType = oView.getModel().getProperty("/schemeType");
            var sCustomerId = this._getSelectedCustomerId();

            if (!sSchemeType) {
                MessageToast.show("Please select a scheme type first.");
                return;
            }

            if (sSchemeType === "advance" && !sCustomerId) {
                MessageToast.show("Please fetch delivery items first to determine the customer.");
                return;
            }

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
                oDialog.getModel("schemes").setData([]);
                oDialog.getBinding("items").filter([]);
                oDialog.open();
                oDialog.setBusy(true);

                (sSchemeType === "regular" ? this._readRegularSchemes() : this._readSchemes(sCustomerId))
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

        _readRegularSchemes() {
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");

            return fetch(sServiceUri + "regular_scheme", {
                headers: { "Accept": "application/json" }
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }
                return oResponse.json();
            }).then(function (oData) {
                return ((oData && oData.value) || []).map(function (oRow) {
                    return {
                        SrNo: oRow.SrNo,
                        SchemeId: oRow.SchemeId || "",
                        SchemeName: oRow.SchemeName,
                        SchemeType: oRow.SchemeType || "REGULAR",
                        Discount1: (Number(oRow.DisA) || 0) + "%",
                        Discount2: "0%",
                        ValidTill: oRow.ValidTill,
                        AdvAmount: 0,
                        Currency: "INR"
                    };
                });
            });
        },

        _readSchemes(sCustomerId) {
            // The backend's Scheme entity set fans out one row per Customer
            // for the same underlying document (its declared OData key is
            // just AccountingDocument/AccountingDocumentItem/PostingDate),
            // so two customers sharing a scheme produce duplicate key
            // predicates. Reading it via bindList()/requestContexts() makes
            // the OData v4 model build a keyed cache and throw "Duplicate
            // key predicate" on those rows. We only need the scheme
            // definition (not a live-bound entity), so read the raw JSON
            // directly instead and de-duplicate on the client - keyed by
            // document/item/customer so distinct customers on the same
            // document each keep their own row (needed now that both are
            // shown as columns).
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");

            var sFilter = sCustomerId ? "?$filter=Customer eq '" + String(sCustomerId).replace(/'/g, "''") + "'" : "";
            var sUrl = sServiceUri + "Scheme" + sFilter;

            return fetch(sUrl, {
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
                    var sDedupeKey = [oRow.AccountingDocument, oRow.AccountingDocumentItem, oRow.Customer].join("|");

                    if (mSeen[sDedupeKey]) {
                        return;
                    }
                    mSeen[sDedupeKey] = true;

                    aSchemes.push({
                        SchemeId: oRow.SchemeId || "",
                        AccountingDocument: oRow.AccountingDocument,
                        AccountingDocumentItem: oRow.AccountingDocumentItem,
                        SchemeName: oRow.SchemeName,
                        SchemeType: oRow.scheme_type,
                        Discount1: oRow.DiscountA + "%",
                        Discount2: oRow.DiscountB + "%",
                        AdvAmount: oRow.Amount,
                        Currency: oRow.CompanyCodeCurrency,
                        // Not yet in the API response - defaults to blank
                        // until the backend adds it.
                        CustomerName: oRow.customerName || ""
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
                        new Filter("SchemeType", FilterOperator.Contains, sQuery),
                        new Filter("AccountingDocument", FilterOperator.Contains, sQuery),
                        new Filter("CustomerName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ] : []);
        },

        onSchemeValueHelpConfirm(oEvent) {
            var oModel = this.getView().getModel();
            var bAdvance = oModel.getProperty("/schemeType") === "advance";
            var aSelectedItems = bAdvance ? (oEvent.getParameter("selectedItems") || []) :
                [oEvent.getParameter("selectedItem")].filter(Boolean);

            if (!aSelectedItems.length) {
                oModel.setProperty("/schemeDetails", null);
                oModel.setProperty("/schemeSelectedText", "");
                oModel.setProperty("/schemeSummaryText", "");
                oModel.setProperty("/hasSchemeDetails", false);
                this._rebuildBillingItems();
                return;
            }

            var aSchemes = aSelectedItems.map(function (oItem) {
                return oItem.getBindingContext("schemes").getObject();
            });
            var oSchemeDetails = bAdvance ? this._combineAdvanceSchemes(aSchemes) : aSchemes[0];

            oModel.setProperty("/schemeDetails", oSchemeDetails);
            oModel.setProperty("/schemeSelectedText", oSchemeDetails.SchemeName + " (" + oSchemeDetails.SchemeType + ")");
            oModel.setProperty("/schemeSummaryText", this._formatSchemeSummary(oSchemeDetails));
            oModel.setProperty("/hasSchemeDetails", true);

            this._rebuildBillingItems();

            MessageToast.show("\"" + oSchemeDetails.SchemeName + "\" scheme selected.");
        },

        _combineAdvanceSchemes(aSchemes) {
            var fMaxDiscount1 = 0;
            var fAdvance = 0;
            var fDiscount2Amount = 0;
            aSchemes.forEach(function (oScheme) {
                var fAmount = this._parseAmount(oScheme.AdvAmount);
                fMaxDiscount1 = Math.max(fMaxDiscount1, this._parsePercent(oScheme.Discount1) * 100);
                fAdvance += fAmount;
                fDiscount2Amount += Math.abs(fAmount) * this._parsePercent(oScheme.Discount2);
            }.bind(this));
            return {
                SchemeName: aSchemes.map(function (oScheme) { return oScheme.SchemeName; }).join(", "),
                SchemeType: "ADVANCE",
                Discount1: fMaxDiscount1 + "%",
                Discount2: "0%",
                Discount2Amount: this._round2(fDiscount2Amount),
                AdvAmount: this._round2(fAdvance),
                Currency: aSchemes[0].Currency || "INR",
                SelectedSchemes: aSchemes
            };
        },

        onSchemeValueHelpCancel(oEvent) {
            var oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _getSelectedCustomerId() {
            if (!this._mDeliveryGroupInfo || !Object.keys(this._mDeliveryGroupInfo).length) {
                return null;
            }
            var aDeliveryKeys = Object.keys(this._mDeliveryGroupInfo);
            return this._mDeliveryGroupInfo[aDeliveryKeys[0]].customerId || null;
        },

        _formatSchemeSummary(oSchemeDetails) {
            oSchemeDetails = oSchemeDetails || {};

            if (String(oSchemeDetails.SchemeType).toUpperCase() === "REGULAR") {
                return "Scheme: " + oSchemeDetails.SchemeName +
                    "  |  Type: " + oSchemeDetails.SchemeType +
                    "  |  Discount 1: " + oSchemeDetails.Discount1 +
                    "  |  Valid Till: " + (oSchemeDetails.ValidTill || "");
            }

            return "Scheme: " + oSchemeDetails.SchemeName +
                "  |  Type: " + oSchemeDetails.SchemeType +
                "  |  Discount 1: " + oSchemeDetails.Discount1 +
                "  |  Discount 2: " + (oSchemeDetails.SelectedSchemes ?
                    this._formatAmount(oSchemeDetails.Discount2Amount) + " " + (this.getView().getModel().getProperty("/transactionCurrency") || "") : oSchemeDetails.Discount2) +
                "  |  Adv Amount: " + oSchemeDetails.AdvAmount;
        },

        // ---------------------------------------------------------------
        // Advance schemes use the highest Discount 1 and allocate their
        // Discount 2 amount proportionally to line values after Discount 1.
        // GST is calculated on the discounted line amount.
        // ---------------------------------------------------------------

        _rebuildBillingItems() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var oScheme = oModel.getProperty("/schemeDetails");
            oModel.setProperty("/transactionCurrency", aItems.length ? aItems[0].transactionCurrency || "" : "");

            if (!aItems.length || !oScheme) {
                oModel.setProperty("/billingItems", []);
                oModel.setProperty("/billingTotal", 0);
                oModel.setProperty("/schemeValid", true);
                oModel.setProperty("/schemeErrorText", "");
                return;
            }

            var fDisc1 = this._parsePercent(oScheme.Discount1);
            var fDisc2 = this._parsePercent(oScheme.Discount2);
            var bAdvance = !!oScheme.SelectedSchemes;
            var aValuesAfterDisA = aItems.map(function (oItem) {
                var fRate = oItem.rate || 0;
                var fRateAfterDisA = this._round2(fRate - (fRate * fDisc1));
                return this._round2(fRateAfterDisA * (oItem.quantityinbaseunit || 0));
            }.bind(this));
            var fValueAfterDisATotal = this._round2(aValuesAfterDisA.reduce(function (fSum, fValue) {
                return fSum + fValue;
            }, 0));
            // A zero-value line has no share; place any remaining cents on
            // the last line that contributes to the allocation.
            var iLastAllocationIndex = -1;
            aValuesAfterDisA.forEach(function (fValue, iIndex) {
                if (fValue > 0) {
                    iLastAllocationIndex = iIndex;
                }
            });
            var fAllocatedDiscount = 0;

            var aBillingItems = aItems.map(function (oItem, iIndex) {
                var fRate = oItem.rate || 0;
                var fQty = oItem.quantityinbaseunit || 0;

                var fRateAfterDisA = this._round2(fRate - (fRate * fDisc1));
                var fRateAfterDisB = this._round2(fRateAfterDisA - (fRateAfterDisA * fDisc2));
                var fValueAfterDisB = this._round2(fRateAfterDisB * fQty);
                var fDiscount2Amount = 0;
                if (bAdvance) {
                    // Round each share independently; the last contributing
                    // line receives the remainder so allocations match DIS2.
                    if (fValueAfterDisATotal > 0 && aValuesAfterDisA[iIndex] > 0) {
                        fDiscount2Amount = iIndex === iLastAllocationIndex ?
                            this._round2(oScheme.Discount2Amount - fAllocatedDiscount) :
                            this._round2(oScheme.Discount2Amount * aValuesAfterDisA[iIndex] / fValueAfterDisATotal);
                    }
                    fAllocatedDiscount = this._round2(fAllocatedDiscount + fDiscount2Amount);
                    fValueAfterDisB = this._round2(aValuesAfterDisA[iIndex] - fDiscount2Amount);
                    fRateAfterDisB = fQty ? this._round2(fValueAfterDisB / fQty) : 0;
                }
                var fGstRate = Number(oItem.gstRate) || 0;
                var fGstValue = this._round2(fValueAfterDisB * (fGstRate / 100));
                var fTotal = this._round2(fValueAfterDisB + fGstValue);

                return {
                    srNo: oItem.srNo,
                    qty: oItem.qty,
                    unit: oItem.unit,
                    quantityinbaseunit: oItem.quantityinbaseunit,
                    actualUom: oItem.actualUom,
                    rate: oItem.rate,
                    schemeName: oScheme.SchemeName,
                    schemeType: oScheme.SchemeType,
                    discount1: oScheme.Discount1,
                    transactionCurrency: oItem.transactionCurrency || "",
                    discount2: bAdvance ? this._formatAmount(fDiscount2Amount) + " " + (oItem.transactionCurrency || "") : oScheme.Discount2,
                    discount2Amount: fDiscount2Amount,
                    discount2Percent: bAdvance ? (aValuesAfterDisA[iIndex] > 0 ?
                        fDiscount2Amount / aValuesAfterDisA[iIndex] * 100 : 0) : fDisc2 * 100,
                    rateAfterDisA: fRateAfterDisA,
                    valueAfterDisA: aValuesAfterDisA[iIndex],
                    rateAfterDisB: fRateAfterDisB,
                    valueAfterDisB: fValueAfterDisB,
                    gstRate: fGstRate,
                    gstPercent: fGstRate + "%",
                    gstValue: fGstValue,
                    total: fTotal
                };
            }.bind(this));

            var fBillingTotal = this._round2(aBillingItems.reduce(function (fSum, oBillingItem) {
                return fSum + (oBillingItem.total || 0);
            }, 0));

            oModel.setProperty("/billingItems", aBillingItems);
            oModel.setProperty("/billingTotal", fBillingTotal);

            oModel.setProperty("/schemeValid", true);
            oModel.setProperty("/schemeErrorText", "");
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

        _formatAmount(fValue) {
            return (fValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
            if (oModel.getProperty("/postingComplete") || oModel.getProperty("/posting")) {
                return;
            }
            var aBillingItems = oModel.getProperty("/billingItems") || [];

            if (!aBillingItems.length) {
                MessageToast.show("Fetch delivery items and select a scheme before posting.");
                return;
            }

            var oPayload = this._buildSchemeBillingPayload();
            var sValidationError = this._getDeliveryValidationError(oModel.getProperty("/items"));
            if (sValidationError) {
                MessageBox.error(sValidationError, { title: "Delivery cannot be billed" });
                return;
            }

            oModel.setProperty("/posting", true);
            BusyIndicator.show(0);

            this._postSchemeBilling(oPayload)
                .then(function (oResult) {
                    BusyIndicator.hide();
                    this._showSchemeBillingResult(oResult);
                }.bind(this))
                .catch(function (oError) {
                    BusyIndicator.hide();
                    MessageBox.error("Could not post scheme billing: " + (oError && oError.message ? oError.message : oError));
                })
                .finally(function () {
                    oModel.setProperty("/posting", false);
                });
        },

        // The action responds 200 OK even for business failures (e.g. a
        // delivery already fully invoiced) - the outcome is only in the
        // response body's own Status/Message, not the HTTP status code, so
        // that's what drives the success/error box.
        _showSchemeBillingResult(oResult) {
            oResult = oResult || {};
            var sStatus = String(oResult.ProcessStatus || "UNKNOWN").toUpperCase();
            var aLines = ["Status: " + sStatus];
            if (oResult.CurrentStep) { aLines.push("Current step: " + oResult.CurrentStep); }
            ["PreliminaryBillingDocument", "PricingDocument", "FinalBillingDocument"].forEach(function (sField) {
                if (oResult[sField]) { aLines.push(sField + ": " + oResult[sField]); }
            });
            var bFailed = sStatus === "ERROR" || sStatus === "FAILED" || sStatus === "FAILURE";
            ["CreatePBD", "Discount1", "Discount2"].forEach(function (sStep) {
                var sStepStatus = String(oResult[sStep + "Status"] || "").toUpperCase();
                if (["ERROR", "FAILED", "FAILURE"].indexOf(sStepStatus) !== -1) { bFailed = true; }
                if (sStepStatus || oResult[sStep + "Message"]) {
                    aLines.push(sStep + " [" + sStepStatus + "]: " + (oResult[sStep + "Message"] || ""));
                }
            });
            (oResult.SAP__Messages || []).forEach(function (oMessage) {
                if (oMessage.message) { aLines.push(oMessage.message); }
            });
            var sMessage = aLines.join("\n\n");
            if (bFailed) {
                MessageBox.error(sMessage, { title: "Billing failed" });
            } else if (sStatus === "SUCCESS") {
                this.getView().getModel().setProperty("/postingComplete", true);
                MessageBox.success(sMessage, { title: "Billing successful" });
            } else {
                MessageBox.warning(sMessage, { title: "Billing status not confirmed" });
            }
        },

        _buildSchemeBillingPayload() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var aBillingItems = oModel.getProperty("/billingItems") || [];
            var oScheme = oModel.getProperty("/schemeDetails") || {};
            var aSchemes = oScheme.SelectedSchemes || [oScheme];
            var fDiscount1 = this._parsePercent(oScheme.Discount1) * 100;
            var mSeen = {};
            var aDeliveries = [];
            var aPostItems = aItems.map(function (oItem, iIndex) {
                var oBill = aBillingItems[iIndex] || {};
                var fQty = Number(oItem.quantityinbaseunit) || 0;
                if (!mSeen[oItem.deliveryNumber]) {
                    mSeen[oItem.deliveryNumber] = true;
                    aDeliveries.push({
                        DeliveryDocument: oItem.deliveryNumber,
                        BillingDocumentType: "",
                        BillingDocumentDate: oItem.billingDocumentDate || "",
                        SalesOrganization: oItem.salesOrganization || "",
                        DestinationCountry: oItem.destinationCountry || "",
                        SDDocumentCategory: "J",
                        Customer: oItem.customerId || ""
                    });
                }
                return {
                    DeliveryDocument: oItem.deliveryNumber,
                    DeliveryDocumentItem: "",
                    Product: oItem.product || "",
                    ProductDescription: "",
                    Customer: oItem.customerId || "",
                    Color: oItem.color || "",
                    ProductSize: oItem.size || "",
                    Brand: oItem.brand || "",
                    HSNCode: oItem.hsnCode || "",
                    Bag: String(oItem.unit).toUpperCase() === "BAG" ? oItem.qty : oItem.bag,
                    Pack: oItem.pack || 0,
                    Quantity: fQty,
                    QuantityUnit: oItem.actualUom || "",
                    OriginalRate: oItem.rate,
                    Discount1Percent: fDiscount1,
                    Discount1Amount: this._round2(oItem.rate * fDiscount1 / 100),
                    RateAfterDiscount1: oBill.rateAfterDisA,
                    ValueAfterDiscount1: oBill.valueAfterDisA,
                    Discount2Amount: this._round2(oBill.valueAfterDisA - oBill.valueAfterDisB),
                    RateAfterDiscount2: fQty ? Math.round((oBill.valueAfterDisB / fQty + Number.EPSILON) * 1000) / 1000 : 0,
                    ValueAfterDiscount2: oBill.valueAfterDisB,
                    GSTPercent: oBill.gstRate,
                    GSTAmount: oBill.gstValue,
                    FinalRate: fQty ? Math.round((oBill.total / fQty + Number.EPSILON) * 1000) / 1000 : 0,
                    FinalAmount: oBill.total
                };
            }.bind(this));
            var sum = function (sField) {
                return this._round2(aPostItems.reduce(function (fTotal, oItem) {
                    return fTotal + (oItem[sField] || 0);
                }, 0));
            }.bind(this);
            return {
                SchemeType: String(oScheme.SchemeType || oModel.getProperty("/schemeType") || "").toUpperCase(),
                TransactionCurrency: aItems.length ? aItems[0].transactionCurrency || "" : "",
                Discount1Percent: fDiscount1,
                Discount2Amount: sum("Discount2Amount"),
                BillingTotal: sum("ValueAfterDiscount2"),
                GSTAmount: sum("GSTAmount"),
                GrandTotal: sum("FinalAmount"),
                _Deliveries: aDeliveries,
                _Schemes: aSchemes.map(function (oSelected) {
                    var fAdvance = Math.abs(this._parseAmount(oSelected.AdvAmount));
                    var fDis2 = this._parsePercent(oSelected.Discount2) * 100;
                    return {
                        SchemeName: oSelected.SchemeName || "",
                        Discount1Percent: this._parsePercent(oSelected.Discount1) * 100,
                        Discount2Percent: fDis2,
                        AdvanceAmount: fAdvance,
                        CalculatedDiscount2Amount: this._round2(fAdvance * fDis2 / 100)
                    };
                }.bind(this)),
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
            var sActionUrl = sServiceUri + "BillingScheme";

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
                        throw new Error(this._extractErrorMessage(sText) || ("HTTP " + oResponse.status));
                    }.bind(this));
                }

                return oResponse.status === 204 ? null : oResponse.json();
            }.bind(this));
        },

        // Prefer the backend's own error text (either this action's
        // {Message: ...} shape or the standard OData {error: {message}}
        // shape) over the raw HTTP status/body.
        _extractErrorMessage(sText) {
            if (!sText) {
                return "";
            }

            try {
                var oBody = JSON.parse(sText);

                return oBody.Message ||
                    (oBody.error && oBody.error.message && oBody.error.message.value) ||
                    (oBody.error && oBody.error.message) ||
                    sText;
            } catch (e) {
                return sText;
            }
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
