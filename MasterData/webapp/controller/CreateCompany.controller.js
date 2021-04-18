sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/Dialog"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, Dialog) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.CreateCompany", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				companyID: "",
				companyPath: "",
				viewTitle: "",
				listTitle: "",
				totalItems: 0,
				disciplineIDs: []
			});
			this.setModel(oViewModel, "createCompanyView");
			this.getRouter().getTargets().getTarget("CreateCompany").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "";
			if (sMode === "Edit") {
				sObjectPath = "/" + oModel.createKey("Companies", {
					ID: sObjectId
				});
			}
			this.getModel("createCompanyView").setProperty("/mode", sMode);
			this.getModel("createCompanyView").setProperty("/companyID", sObjectId);
			this.getModel("createCompanyView").setProperty("/companyPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createCompanyView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editCompanyViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
				var aFilter = [new Filter({
					path: "company_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: oViewModel.getProperty("/companyID")
				})];
				this.byId("disciplineList").getBinding("items").filter(aFilter, "Application");
				this.byId("disciplineList").getBinding("items").sort(new Sorter("discipline/code"));
			} else {
				// discipline list is not visible in Create mode
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createCompanyViewTitle"));
				var oContext = oModel.createEntry("Companies");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var bSaveEnabled = false,
				sCompanyName = this.byId("companyName").getValue(),
				sRole = this.byId("companyRole").getValue(),
				sAddressID = this.byId("address").getSelectedKey();
			this.getModel("createCompanyView").setProperty("/enableSave", bSaveEnabled);

			if (sCompanyName === "") {
				return;
			}
			if (this.getModel("createCompanyView").getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sCompanyName !== oData.companyName || sRole !== oData.class || sAddressID !== oData.address_ID) {
					bSaveEnabled = true;
				}
			} else {
				bSaveEnabled = true;
			}
			this.getModel("createCompanyView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sCompanyName = this.byId("companyName").getValue(),
				sRole = this.byId("companyRole").getValue() || undefined,
				sAddressID = this.byId("address").getSelectedKey() || undefined,
				that = this;

			this._isCodeUnique(sCompanyName).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createCompanyView").getProperty("/mode") === "Edit" && sCompanyName === oModel.getProperty("companyName",
						oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("companyNameNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
						}
					);
				} else {
					if (!oModel.setProperty("companyName", sCompanyName, oBC) || !oModel.setProperty("class", sRole, oBC) || !oModel.setProperty(
							"address_ID", sAddressID, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createCompanyView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("companyDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("companyDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			this.getModel("createCompanyView").setProperty("/enableSave", false);
			if (this.getModel("createCompanyView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Companies");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Companies",
				aFilter = [new Filter({
					path: "companyName",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		},

		onDisciplineListUpdateFinished: function (oEvent) {
			var oList = this.byId("disciplineList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("createCompanyView"),
				aItems = [],
				aDisciplineIDs = [],
				sDisciplineID = "";

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("disciplineTableHeadingCount", [iTotalItems]);
				aItems = oList.getItems();
				for (var i = 0; i < aItems.length; i++) {
					sDisciplineID = aItems[i].getBindingContext().getProperty("discipline_ID");
					aDisciplineIDs.push(sDisciplineID);
				}
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
			oViewModel.setProperty("/disciplineIDs", aDisciplineIDs);
		},

		_filterDisciplineSelectList: function () {
			var oFrag = sap.ui.core.Fragment,
				oDiscSelectList = oFrag.byId("discSelect", "disciplineSelectList"),
				aAssignedDisciplineIDs = this.getModel("createCompanyView").getProperty("/disciplineIDs"),
				aFilters = [];

			if (aAssignedDisciplineIDs.length === 0) {
				return;
			}
			for (var i = 0; i < aAssignedDisciplineIDs.length; i++) {
				aFilters.push(new Filter({
					path: "ID",
					operator: sap.ui.model.FilterOperator.NE,
					value1: aAssignedDisciplineIDs[i]
				}));
			}
			var aCombinedFilter = new Filter({
				filters: aFilters,
				and: true
			});
			oDiscSelectList.getBinding("items").filter(aCombinedFilter, "Application");
		},

		onAddDiscipline: function () {
			if (!this._oDialog) {
				this._oDialog = sap.ui.xmlfragment("discSelect", "master.data.MasterData.view.SelectDiscipline", this);
				this.getView().addDependent(this._oDialog);
				this._oDialog.addStyleClass("sapUiContentPadding");
			}
			this._filterDisciplineSelectList();
			this._oDialog.open();
		},

		onDeleteDiscipline: function () {
			var aSelectedContexts = this.byId("disciplineList").getSelectedContexts(false),
				oModel = this.getModel(),
				sPath = "";
			for (var i = 0; i < aSelectedContexts.length; i++) {
				sPath = aSelectedContexts[i].getPath();
				oModel.remove(sPath);
			}
		},

		onSelectionChange: function (oEvent) {
			if (this.byId("disciplineList").getSelectedContexts(false).length > 0) {
				this.byId("deleteButton").setEnabled(true);
			} else {
				this.byId("deleteButton").setEnabled(false);
			}
		},

		handleFragClose: function (oEvent) {
			var aItems = oEvent.getParameter("selectedItems"),
				aDisciplines = [],
				oModel = this.getModel(),
				sCompanyID = this.getModel("createCompanyView").getProperty("/companyID"),
				oViewModel = this.getModel("createCompanyView");

			if (aItems && aItems.length > 0) {
				oViewModel.setProperty("/busy", true);
				for (var i = 0; i < aItems.length; i++) {
					aDisciplines.push(aItems[i].getBindingContext().getObject().ID);
				}
				aDisciplines.reduce(function (p, v) {
					new Promise(function (resolve) {
						var oData = {
							discipline_ID: v,
							company_ID: sCompanyID
						};
						oModel.create("/DisciplinesOfCompanies", oData, {
							success: function (oResult) {
								oViewModel.setProperty("/busy", false);
							}
						});
					});
				}, 0, Promise.resolve());
			}
		},

		handleFragCancel: function () {
			return;
		},

		_isDisciplineAssignmentUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/DisciplinesOfCompanies",
				aFilter = [new Filter({
					path: "discipline_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(sCode);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		}

	});

});