sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateProfession", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				professionID: "",
				professionPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createProfessionView");
			this.getRouter().getTargets().getTarget("CreateProfession").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Professions", {
					ID: sObjectId
				});
			this.getModel("createProfessionView").setProperty("/mode", sMode);
			this.getModel("createProfessionView").setProperty("/professionID", sObjectId);
			this.getModel("createProfessionView").setProperty("/professionPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createProfessionView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editProfessionViewTitle"));
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
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createProfessionViewTitle"));
				var oContext = oModel.createEntry("Professions");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sDisciplineID = this.byId("disciplineCode").getSelectedKey(),
				bSaveEnabled = false;
			if (this.getModel("createProfessionView").getProperty("/mode") === "Create") {
				if (sCode && sDescription) {
					bSaveEnabled = true;
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sCode !== "" && sDescription !== "") {
					if (sCode !== oData.code || sDescription !== oData.description || sDisciplineID !== oData.discipline_ID) {
						bSaveEnabled = true;
					}
				}
			}
			this.getModel("createProfessionView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sDisciplineID = this.byId("disciplineCode").getSelectedKey(),
				that = this;
			if (sDisciplineID === "") {
				sDisciplineID = undefined; // otherwise db 400 error
			}

			this._isCodeUnique(sCode).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createProfessionView").getProperty("/mode") === "Edit" && sCode === oModel.getProperty("code", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("codeNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					if (!oModel.setProperty("code", sCode, oBC) || !oModel.setProperty("description", sDescription, oBC) || !oModel.setProperty(
							"discipline_ID",
							sDisciplineID, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createProfessionView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
									//styleClass: that.getOwnerComponent().getContentDensityClass()
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
				sConfirmTitle = this.getResourceBundle().getText("professionDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("professionDeleteConfirmationText"),
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
			if (this.getModel("createProfessionView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createProfessionView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Professions");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Professions",
				aFilter = [new Filter({
					path: "code",
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
		}

	});

});